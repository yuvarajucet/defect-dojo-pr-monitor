from django.db.models import Exists, OuterRef
import json
from datetime import datetime
from django.conf import settings
import logging


from dojo.gitea_webhook.helper import GiteaPrInfo, ValidationStatus
from dojo.models import PRMonitor, PRMonitorFiles, PRProjectHandler, PRCommitsLogger, Product

logger = logging.getLogger(__name__)

def add_new_pr(data:GiteaPrInfo):
    """
    Use case:
        Create a new PRMonitor entry for an incoming PR, log its initial commit,
        and compute the critical-file validation status right after insert.

    Parameters:
        data (GiteaPrInfo):
            Parsed PR payload containing PR metadata, commit info, product, and repo details.

    Returns:
        bool:
            True when critical-file validation finds any matching critical file
            (or the helper returns True), otherwise False. False is also returned
            upon exception.
    """
    try:
        from dojo.gitea_webhook.helper import check_critical_files_after_pr_insert
        
        #TODO: Need to add new table and need to log not listed product items.
        
        current_product = Product.objects.get(name = data.product)

        PRMonitor.objects.create(
            pr_title = data.pr_title,
            created_by = data.created_by,
            target_branch = data.target_branch,
            pr_status = data.pr_status,
            validation_status = data.validation_status.lower(),
            ticket_link = data.ticket_link,
            issue_reason = data.reason_for_issue,
            validated_at = data.validated_at,
            repo_name = data.repo_name,
            product = current_product,
            validated_by_id = data.validated_by,
            pr_number = data.pr_number,
            pr_link = data.pr_link,
            created_at = datetime.now(),
            pr_have_critical_file = data.have_critical_file
        )
        add_new_commits(data, current_product)
        status = check_critical_files_after_pr_insert(data.pr_number, data.product, data.repo_name)
        return status
    except Exception as ex:
        logging.exception(f"[-] Exception occurred \n Method: {add_new_pr.__name__} \n Exception:\n{ex}")
        return False

def update_new_pr_info_on_edit(data: GiteaPrInfo) -> bool:
    """
    Use case:
        Update PR metadata when PR details change (e.g., title, status, validation state).

    Parameters:
        data (GiteaPrInfo):
            Parsed PR payload with the latest metadata for the target PR.

    Returns:
        bool:
            True if at least one database row was updated; False otherwise or on exception.
    """
    try:
        rows = PRMonitor.objects.filter(pr_number=data.pr_number).update(
            pr_title = data.pr_title,
            created_by = data.created_by,
            target_branch = data.target_branch,
            pr_status = data.pr_status,
            validation_status = data.validation_status.lower(),
            ticket_link = data.ticket_link,
            issue_reason = data.reason_for_issue,
            validated_at = data.validated_at,
            repo_name = data.repo_name,
            product = Product.objects.get(name = data.product),
            validated_by_id = data.validated_by,
            pr_number = data.pr_number,
            pr_link = data.pr_link,
            pr_have_critical_file = data.have_critical_file
        )
        return bool(rows)
    except Exception as ex:
        logging.exception(f"[-] Exception occurred \n Method: {update_new_pr_info_on_edit.__name__} \n Exception:\n{ex}")
        return False


def add_new_commits(data:GiteaPrInfo, current_product):
    """
    Use case:
        Persist a single commit log record tied to a PR and product.

    Parameters:
        data (GiteaPrInfo):
            The PR payload that includes commit id, message, author, files, etc.
        current_product (Product):
            The Product model instance associated with this PR/commit.

    Returns:
        bool | None:
            Returns None on success; False if an exception occurs (for backward compatibility
            with current callers that do not inspect the return value).
    """
    try:
        PRCommitsLogger.objects.create(
            pr_number = data.pr_number,
            commit_id = data.commit_id,
            commit_msg = data.commit_message,
            product = current_product,
            repo_name = data.repo_name,
            commited_by = data.commited_by,
            commited_files = data.commited_file_info_collection,
            commited_at = datetime.now()
        )
    except Exception as ex:
        logging.exception(f"[-] Exception occurred \n Method: {add_new_commits.__name__} \n Exception:\n{ex}")
        return False


def add_new_commits_bulk(items: list[GiteaPrInfo]) -> int:
    """
    Use case:
        Efficiently insert multiple commit log entries in a single bulk operation.

    Parameters:
        items (list[GiteaPrInfo]):
            Collection of PR commit payloads to be persisted.

    Returns:
        int:
            Number of PRCommitsLogger rows successfully created; 0 on empty input or exception.
    """
    try:
        if not items:
            return 0

        now = datetime.now()
        objs: list[PRCommitsLogger] = [
            PRCommitsLogger(
                pr_number=item.pr_number,
                commit_id=item.commit_id,
                commit_msg=item.commit_message,
                product = Product.objects.get(name = item.product),
                repo_name = item.repo_name,
                commited_by=item.commited_by,
                commited_files=item.commited_file_info_collection,
                commited_at=now,
            )
            for item in items
        ]

        created = PRCommitsLogger.objects.bulk_create(objs)
        return len(created)
    except Exception as ex:
        logging.exception(f"[-] Exception occurred \n Method: {add_new_commits_bulk.__name__} \n Exception:\n{ex}")
        return 0

def update_have_critical_file_column(pr_number: str, product_name: str, repo_name: str, status: bool):
    """
    Use case:
        Update the PRMonitor.pr_have_critical_file flag while preventing accidental
        downgrades from True to False when the flag is already True.

    Parameters:
        pr_number (str):
            Pull request identifier.
        product_name (str):
            Name of the Product associated with the PR.
        repo_name (str):
            Repository name where the PR exists.
        status (bool):
            Desired flag value to persist if it does not overwrite an existing True value.

    Returns:
        int:
            Count of rows updated (0 if no update performed or on exception).
    """
    try:
        existing_status = (
            PRMonitor.objects
            .filter(pr_number=pr_number, product__name=product_name, repo_name=repo_name)
            .values_list("pr_have_critical_file", flat=True)
            .first()
        )

        if existing_status is not None and existing_status == True:
            return 0

        rows = (
            PRMonitor.objects
            .filter(pr_number=pr_number, product__name=product_name, repo_name=repo_name)
            .update(pr_have_critical_file=status)
        )
        return rows
    except Exception as ex:
        logging.exception(f"[-] Exception occurred \n Method: {update_have_critical_file_column.__name__} \n Exception:\n{ex}")
        return 0

def get_pr_info_by_prid(pr_id:str):
    """
    Use case:
        Retrieve PRMonitor details for a given PR number.

    Parameters:
        pr_id (str):
            Pull request identifier.

    Returns:
        list[dict]:
            List of serialized PRMonitor rows (dictionary values) matching the PR id.
            Empty list on exception.
    """
    try:
        info = PRMonitor.objects.filter(pr_number=pr_id)
        return list(info.values())
    except Exception as ex:
        logging.exception(f"[-] Exception occurred \n Method: {get_pr_info_by_prid.__name__} \n Exception:\n{ex}")
        return list()

def get_commit_files_by_prid(pr_id:str, product_name: str, repo_name:str):
    """
    Use case:
        Aggregate all arrays of committed files for commits in a PR for the specified
        product and repository.

    Parameters:
        pr_id (str):
            Pull request identifier.
        product_name (str):
            Name of the Product for filtering commit logs.
        repo_name (str):
            Repository name for filtering commit logs.

    Returns:
        list[list | dict | str]:
            A list where each element is the stored commited_files payload for a commit
            (structure depends on how commited_files is persisted). Empty list on exception.
    """
    try:
        collected_info = PRCommitsLogger.objects.filter(pr_number=pr_id, product=product_name, repo_name=repo_name).values("commited_files")
        files_array_collection = []
        for info in collected_info:
            files_array_collection.append(info["commited_files"])
        
        return files_array_collection
    except Exception as ex:
        logging.exception(f"[-] Exception occurred \n Method: {get_commit_files_by_prid.__name__} \n Exception:\n{ex}")
        return []

def get_product_critical_files_by_repo(product_name: str, repo_name: str):
    """
    Use case:
        Look up the configured critical files for a product within a repository.

    Parameters:
        product_name (str):
            Name of the Product.
        repo_name (str):
            Repository name.

    Returns:
        list:
            List of file name patterns/entries considered critical for this product/repo.
            Empty list on exception.
    """
    try:
        qs = PRMonitorFiles.objects.filter(
            product__name=product_name,
            repo_name=repo_name
        ).values_list("file_names", flat=True)
        return list(qs)
    except Exception as ex:
        logging.exception(f"[-] Exception occurred \n Method: {get_product_critical_files_by_repo.__name__} \n Exception:\n{ex}")
        return list()

def get_commits_sha_by_pr_id(pr_id:str, reponame, product):
    """
    Use case:
        Retrieve the list of commit SHA identifiers associated with a PR.

    Parameters:
        pr_id (str):
            Pull request identifier.
        reponame (str):
            Repository name to filter commits.
        product (str | Product):
            Product filter; may be a Product instance or identifier depending on model field usage.

    Returns:
        list[dict]:
            List of objects shaped like {"commit_id": <sha>} for each matching commit.
            Empty list on exception.
    """
    try:
        info = PRCommitsLogger.objects.filter(pr_number=pr_id, repo_name=reponame, product=product)
        return list(info.values("commit_id"))
    except Exception as ex:
        logging.exception(f"[-] Exception occurred \n Method: {get_commits_sha_by_pr_id.__name__} \n Exception:\n{ex}")
        return list()