import json
from enum import Enum
from dataclasses import dataclass
import requests
from django.conf import settings

class PRStatus(Enum):
    NONE = "None"
    OPEN = "opened"
    CLOSED = "closed"
    REOPEN = "reopened"
    EDITED = "edited"
    SYNC = "synchronized"

class ValidationStatus(Enum):
    NONE = "Not Validated"
    ISSUE = "New issue"
    NOT_AN_ISSUE = "Not an issue"
    BREAKING_ISSUE = "Breaking issue"

@dataclass
class CommitedFileInfo:
    filename: str
    status: str

class GiteaPrInfo:
    def __init__(self, 
                 action: PRStatus = PRStatus.NONE,
                 pr_status: str = "",
                 pr_title: str = "",
                 created_by: str = "",
                 target_branch: str = "",
                 commit_message: str = "",
                 commit_id: str = "",
                 pr_number: str = "",
                 pr_link: str = "",
                 commited_by: str = "",
                 repo_name: str = "",
                 product_name: str = "",
                 commited_file_info_collection: CommitedFileInfo = None,
                 validation_status: ValidationStatus = ValidationStatus.NONE,
                 ticket_link: str = "",
                 reason_for_issue: str = "",
                 validated_at: str = "",
                 validated_by: int = 0,
                 have_critical_file: bool = False):
        """
        Container for PR metadata and commit details used across webhook processing and DB writes.

        Args:
            action (PRStatus): Webhook action translated to PRStatus (opened/closed/edited/etc.).
            pr_status (str): Current PR state as reported by Gitea (e.g., "open", "closed").
            pr_title (str): Title of the pull request.
            created_by (str): Username/login of the PR author.
            target_branch (str): Base branch of the PR.
            commit_message (str): Message of the head commit at time of webhook.
            commit_id (str): SHA of the head commit for the PR.
            pr_number (str): Numeric identifier of the PR in the repository.
            pr_link (str): HTML URL to the PR on Gitea.
            commited_by (str): Committer name of the head commit.
            repo_name (str): Repository name (lowercased).
            product_name (str): Organization/owner segment of repo full name.
            commited_file_info_collection (list[CommitedFileInfo] | None): Files touched by the commit with status.
            validation_status (ValidationStatus): Validation state tracked by the system for this PR.
            ticket_link (str): External ticket/issue link related to this PR.
            reason_for_issue (str): Reason if the PR is flagged as an issue.
            validated_at (str): Timestamp when validation happened.
            validated_by (int): User id of the validator.
            have_critical_file (bool): True if PR touches a file configured as critical.

        Notes:
            - This object is used both transiently (webhook processing) and persisted via query helpers.
            - commited_file_info_collection is normalized to a JSON string for DB storage.
        """
        self.action = action
        self.pr_status = pr_status
        self.pr_title = pr_title
        self.created_by = created_by
        self.target_branch = target_branch
        self.commit_message = commit_message
        self.commit_id = commit_id
        self.pr_number = pr_number
        self.pr_link = pr_link
        self.commited_by = commited_by
        self.repo_name = repo_name

        # These values are added dynamically
        self.validation_status = validation_status
        self.ticket_link = ticket_link
        self.reason_for_issue = reason_for_issue
        self.product = product_name
        self.commited_file_info_collection = DataConvertHelper(commited_file_info_collection, CommitedFileInfo).serialize()
        self.validated_at = validated_at
        self.validated_by = validated_by
        self.have_critical_file = have_critical_file

class GiteaHookPayloadParser:
   
    @classmethod
    def from_json(cls, json_data: dict):
        """
        Parse a raw Gitea webhook payload and produce a normalized GiteaPrInfo model.

        This is the entry point for PR-related webhook events. It inspects the
        "action" field and routes to hook_data_parser for the supported states.

        Args:
            json_data (dict): The raw JSON payload sent by Gitea for a pull_request event.

        Returns:
            GiteaPrInfo | None: A populated GiteaPrInfo for actionable PR events; None for unknown/unsupported events.

        Notes:
            - Only PR-related actions defined in PRStatus are supported.
            - When action cannot be mapped, the method returns None to indicate no-op.
        """
        
        parsed_data = None
        current_state = cls.get_current_state(json_data)

        if current_state == PRStatus.NONE:
            return parsed_data
        
        if current_state == PRStatus.OPEN:
            return cls.hook_data_parser(json_data, current_state)

        if current_state == PRStatus.EDITED or current_state == PRStatus.SYNC:
            return cls.hook_data_parser(json_data, current_state)

        if current_state == PRStatus.CLOSED:
            return cls.hook_data_parser(json_data, current_state)

        if current_state == PRStatus.REOPEN:
            return cls.hook_data_parser(json_data, current_state)

        return parsed_data


    @classmethod
    def get_current_state(cls, data) -> PRStatus:
        """
        Map the incoming webhook "action" string to a PRStatus enum value.

        Args:
            data (dict): Webhook payload containing an "action" key.

        Returns:
            PRStatus: A matching PRStatus value; PRStatus.NONE if the field is missing or unrecognized.
        """
        event = data.get('action')
        if event:
            action = PRStatus(event)
            return action
        return PRStatus.NONE

    @classmethod
    def get_additional_information(cls,dependent_url:str, commitId: str, repo_name: str, product_name: str, pr_number: str):
        """
        Fetch additional commit metadata for the PR head commit from Gitea and persist any missing commits.

        Args:
            dependent_url (str): URL template for the Gitea commits API. Placeholders: {owner}, {repo}, {pr_id}.
            commitId (str): SHA of the target commit (PR head).
            repo_name (str): Repository name.
            product_name (str): Organization/owner name.
            pr_number (str): PR id/number.

        Returns:
            list[str | list[CommitedFileInfo]]: [commit_message, committer_name, committed_files]
                - commit_message (str): The commit message.
                - committer_name (str): Name of the committer from the payload.
                - committed_files (list[CommitedFileInfo]): Files changed with their statuses.
            If data is unavailable, returns ["", "", ""].

        Notes:
            - This method also triggers insertion of any commits missing in DB for the PR tail.
        """
        if dependent_url is not None and commitId is not None and repo_name is not None and product_name is not None and pr_number is not None:
            site_url = dependent_url.replace("{owner}", product_name).replace("{repo}", repo_name).replace("{pr_id}", str(pr_number))

            header = {
                "Authorization": "token " + settings.GITEA_ACCESS_KEY
            }
            resp = requests.get(site_url, headers=header)
            if resp.status_code == 200:
                commit_data = resp.json()
                status = cls.check_and_push_missing_commits(commit_data, pr_number, repo_name, product_name)
                [commit_msg, commited_by, commited_file_info_collection] = cls.extract_additional_information_from_commit(commit_data, commitId)
                return [commit_msg, commited_by, commited_file_info_collection]
        return ["", "", ""]

    @classmethod
    def extract_additional_information_from_commit(cls, commit_data, commit_id=""):
        """
        Normalize commit payload and extract message, committer, and changed files.

        Handles both a single-commit dictionary and a list of commit dictionaries.
        When a list is provided, the commit whose "sha" matches commit_id is selected.

        Args:
            commit_data (dict | list[dict]): Commit payload(s) from Gitea.
            commit_id (str, optional): SHA to select when commit_data is a list. Defaults to "".

        Returns:
            list[Any]: [commit_message (str), committer_name (str), committed_files (list[CommitedFileInfo])]

        Raises:
            KeyError: If expected keys are missing in the commit payload.
        """
        current_commit_data = None
        if isinstance(commit_data, list):
            current_commit_data = cls.get_current_commit_data_from_commit_info(commit_data, commit_id)
        else:
            current_commit_data = commit_data
        commit_info = current_commit_data["commit"]
        commit_file_info = current_commit_data["files"]
        commit_changes_info = current_commit_data["stats"]

        # Extract Commit related info
        commit_msg = commit_info["message"]
        commited_by = commit_info["committer"]["name"]
        commit_changes = commit_changes_info["total"]

        # Extract changes file with it's status
        commited_file_info_collection = []
        if len(commit_file_info):
            for fileObject in commit_file_info:
                rfilename = fileObject.get("filename")
                rfile_status = fileObject.get("status")
                commited_file_info_collection.append(CommitedFileInfo(filename = rfilename, status = rfile_status))
        return [commit_msg, commited_by , commited_file_info_collection]


    @classmethod
    def get_current_commit_data_from_commit_info(cls, data, commit_id):
        """
        Locate and return a specific commit object by SHA from a list of commits.

        Args:
            data (list[dict]): List of commit dictionaries (as returned by Gitea API).
            commit_id (str): SHA of the commit to find.

        Returns:
            dict | None: The matching commit dictionary or None if not found.
        """
        if data:
            for current_commit in data:
                if current_commit.get('sha') == commit_id:
                    return current_commit
        return None


    @classmethod
    def check_and_push_missing_commits(cls, commit_data, pr_number, repo_name, product_name):
        """
        Compare tail commits from the payload with DB records and insert the missing ones.

        The first element is considered the head commit and is ignored for missing-check;
        only the tail commits (history) are compared against the DB entries.

        Args:
            commit_data (list[dict] | dict): Commits payload from Gitea for a PR.
            pr_number (str | int): Pull request id.
            repo_name (str): Repository name.
            product_name (str): Organization/owner name.

        Returns:
            Any: Result from insert_missing_commits when new rows are added; False/[] otherwise.
        """
        from dojo.gitea_webhook.queries import get_commits_sha_by_pr_id
        commit_infos = get_commits_sha_by_pr_id(pr_number, repo_name, product_name)

        if not isinstance(commit_data, list):
            return []
        tail_commits = commit_data[1:] if len(commit_data) > 1 else []

        # Compare only the tail commits against DB entries
        is_have_more_than_one_missing_commit = len(tail_commits) != len(commit_infos)
        if is_have_more_than_one_missing_commit:
            existing_shas = {str(row.get("commit_id")) for row in commit_infos if isinstance(row, dict) and row.get("commit_id")}
            missing_commits = [c for c in tail_commits if isinstance(c, dict) and c.get("sha") and str(c.get("sha")) not in existing_shas]
            status = cls.insert_missing_commits(missing_commits, pr_number, repo_name, product_name)
            return status

        # Note: If it didn't have more than one commit means just ignore
        return False


    @classmethod
    def insert_missing_commits(cls, missing_commit_data, pr_number, repo_name, product_name):
        """
        Persist missing commit entries associated with a PR into the commit log table.

        Args:
            missing_commit_data (list[dict]): Commits not present in DB but found in the payload.
            pr_number (str | int): PR identifier.
            repo_name (str): Repository name.
            product_name (str): Organization/owner name.

        Returns:
            Any: Result from add_new_commits_bulk (implementation-defined; typically count or status).
        """
        db_obj: list[GiteaPrInfo] = []
        for item in reversed(missing_commit_data):
            [commit_msg, commited_by, commited_file_info_collection] = cls.extract_additional_information_from_commit(item)
            single_pr_info: GiteaPrInfo = GiteaPrInfo(
                pr_number=str(pr_number),
                commit_message=commit_msg,
                product_name=product_name,
                repo_name=repo_name,
                commited_by=commited_by,
                commit_id=str(item.get("sha", "")),
                commited_file_info_collection=commited_file_info_collection,
            )
            db_obj.append(single_pr_info)

        from dojo.gitea_webhook.queries import add_new_commits_bulk
        result = add_new_commits_bulk(db_obj)
        return result

    @classmethod
    def hook_data_parser(cls, data, current_state):
        """
        Extract PR, repository, and commit context from webhook payload and build a GiteaPrInfo.

        Args:
            data (dict): Raw webhook payload for a pull_request event.
            current_state (PRStatus): Action state previously mapped from payload.

        Returns:
            GiteaPrInfo: Normalized model with enriched commit and validation info.

        Notes:
            - Also queries DB to attach persisted validation state to the PR info when available.
        """
        # Parse Pull Request items.
        pr = data['pull_request']
        status = pr['state']
        pr_link = pr['html_url']
        pr_number = pr['number']
        title = pr['title']
        target_branch = pr['base']['ref']
        created_by = pr['user']['login']
        
        # parse Repository items.
        repo = data['repository']
        repo_name = repo['name'].lower()
        product_name = repo['full_name'].split("/")[0]

        commit_id = pr['head']['sha']
        commit_url = settings.COMMIT_INFO_GETTING_URL
        [commit_message, commited_by, commited_file_info_collection] = cls.get_additional_information(commit_url, commit_id, repo_name, product_name, pr_number)


        have_critical_file = False
        validation_status = ValidationStatus.NONE.value
        ticket_link = ''
        reason_for_issue = ''
        validated_at = ''
        validated_by = ''

        from dojo.gitea_webhook.queries import get_pr_info_by_prid
        pr_info = get_pr_info_by_prid(pr_number)
        if pr_info:
                validation_status = pr_info[0]["validation_status"]
                ticket_link = pr_info[0]["ticket_link"]
                reason_for_issue = pr_info[0]["issue_reason"]
                validated_at = pr_info[0]["validated_at"]
                validated_by = pr_info[0]["validated_by_id"]
                have_critical_file = pr_info[0]["pr_have_critical_file"]
        return GiteaPrInfo(current_state,
                           status,
                           title,
                           created_by,
                           target_branch,
                           commit_message,
                           commit_id,
                           pr_number,
                           pr_link,
                           commited_by,
                           repo_name,
                           product_name,
                           commited_file_info_collection,
                           validation_status,
                           ticket_link,
                           reason_for_issue,
                           validated_at,
                           validated_by,
                           have_critical_file)


class DataConvertHelper:
    def __init__(self, data, currentCls):
        self.data = data
        self.cCls = currentCls

    def serialize(self):
        """
        Convert a collection of CommitedFileInfo into a JSON array string for storage.

        Returns:
            str: JSON string representing [{"filename": str, "status": str}, ...].

        Notes:
            - Expects self.data to be an iterable of CommitedFileInfo.
        """
        return json.dumps([{
            "filename": p.filename,
            "status": p.status
        } for p in self.data])
    
    def deserialize(self):
        """
        Convert JSON/text or raw list data into CommitedFileInfo objects.

        Returns:
            list[CommitedFileInfo]: Parsed list of file info objects; empty list if there is no data.

        Notes:
            - Accepts either a JSON array string or an already parsed list of dicts/objects.
        """
        if not self.data:
            return []
        items = json.loads(self.data) if isinstance(self.data, str) else self.data
        return [self.cCls(filename=i["filename"], status=i["status"]) for i in items]


def check_critical_files_after_pr_insert(pr_number:str, product_name:str, repo_name: str):
    """
    Evaluate whether a PR touches any critical files and update the persisted PR flag accordingly.

    Args:
        pr_number (str): Pull request id.
        product_name (str): Organization/owner name.
        repo_name (str): Repository name.

    Returns:
        Any: Result of update_have_critical_file_column (implementation-defined), or None if PR not found.
    """
    from dojo.gitea_webhook.queries import get_pr_info_by_prid, get_commit_files_by_prid, update_have_critical_file_column
    pr_info = get_pr_info_by_prid(pr_number)
    if pr_info:
        commit_files_list = get_commit_files_by_prid(pr_number, product_name, repo_name)
        have_critical_file = check_commit_have_critical_file(commit_files_list, product_name, repo_name)
        status = update_have_critical_file_column(pr_number, product_name, repo_name, have_critical_file)
        return status



def check_commit_have_critical_file(file_values, product_name, repo_name) -> bool:
    """
    Determine if any committed file is in the configured critical files list for the given product/repo.

    This function normalizes file lists across commits, removes duplicates, and then compares
    the unique set against the configured critical files for the repository.

    Args:
        file_values (Any): Collection of commit file records (rows) returned from the database.
        product_name (str): Organization/owner name.
        repo_name (str): Repository name.

    Returns:
        bool: True if at least one file is critical; False otherwise.
    """
    if not file_values:
        return False

    all_items = []
    for entry in file_values:
        try:
            helper = DataConvertHelper(entry, CommitedFileInfo)
            items = helper.deserialize()
            if items:
                all_items.extend(items)
        except Exception:
            continue

    seen = set()
    unique_items = []
    for i in all_items:
        key = (i.filename, i.status)
        if key in seen:
            continue
        seen.add(key)
        unique_items.append(i)
    
    critical_file_list = get_product_critical_files_list(product_name, repo_name)
    it_have_critical_files = False
    if critical_file_list:
        for ci in unique_items:
            fname = (ci.filename or "").strip().lower()
            if fname in critical_file_list:
                it_have_critical_files = True
                break
    return it_have_critical_files

def get_product_critical_files_list(product_name: str, repo_name: str):
    """
    Retrieve configured critical file names for a product/repo and return a normalized list.

    Args:
        product_name (str): Organization/owner name.
        repo_name (str): Repository name.

    Returns:
        list[str]: List of lowercase critical file paths/names. Empty list when none configured.
    """
    from dojo.gitea_webhook.queries import get_product_critical_files_by_repo
    raw_files = get_product_critical_files_by_repo(product_name, repo_name.lower())
    if not raw_files:
        return []
    cleaned_files = [f.strip().lower() for f in raw_files if isinstance(f, str) and f.strip()]
    if len(cleaned_files):
        return cleaned_files[0].split(",")
    return []
