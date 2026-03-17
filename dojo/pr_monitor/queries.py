from datetime import datetime
import logging

from crum import get_current_user
from dojo.models import PRMonitor, PRMonitorFiles, PRProjectHandler, PRCommitsLogger, Product, Dojo_User, Dojo_Group
from dojo.gitea_webhook.helper import GiteaPrInfo, ValidationStatus
from dojo.pr_monitor.helper import FilterValues

logger = logging.getLogger(__name__)

def get_pr_list_for_view(filterCondition: ValidationStatus, isNotInclude=False, filter=False):
    """Return PRMonitor entries filtered by validation status and critical-file flag.

    Args:
        filterCondition (ValidationStatus): Status enum used for include/exclude filtering.
        isNotInclude (bool): If True, exclude rows with the given status; otherwise include.
        filter (bool): If True, only include PRs that have critical files.

    Returns:
        list[dict]: Ordered list of PRs as dictionaries; includes "validated_by" username when available.
    """
    try:
        qs = PRMonitor.objects.all()
        if isNotInclude:
            qs = qs.exclude(validation_status = filterCondition.value.lower())
        else:
            qs = qs.filter(validation_status = filterCondition.value.lower())
        
        if filter:
            qs = qs.filter(pr_have_critical_file=True)

        qs = qs.order_by('-id')
        items = list(qs.values())

        try:
            user_ids = [i.get('validated_by_id') for i in items if i.get('validated_by_id')]
            if user_ids:
                users = Dojo_User.objects.filter(id__in=user_ids).values('id', 'username')
                id_to_username = {u['id']: u['username'] for u in users}
                for i in items:
                    uid = i.get('validated_by_id')
                    i['validated_by'] = id_to_username.get(uid)
                    i.pop('validated_by_id', None)
        except Exception:
            pass

        return items
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_pr_list_for_view.__name__} \n Exception:\n{ex}")
        return list()

def get_more_pr_info(prnumber, product, reponame):
    """Aggregate monitor, commits, and validation option data for a PR.

    Args:
        prnumber (int|str): Pull request number.
        product (str): Product name associated with the PR.
        reponame (str): Repository name associated with the PR.

    Returns:
        dict: {"monitor": [...], "project_handler": str|"", "commits": [...],
               "validation_options": [str], "status": bool}. Empty dict on error.
    """
    try:
        monitor_data = PRMonitor.objects.filter(pr_number=prnumber).order_by('-id')
        monitor_items = list(monitor_data.values())

        try:
            user_ids = [m.get('validated_by_id') for m in monitor_items if m.get('validated_by_id')]
            if user_ids:
                users = Dojo_User.objects.filter(id__in=user_ids).values('id', 'username')
                id_to_username = {u['id']: u['username'] for u in users}
                for m in monitor_items:
                    uid = m.get('validated_by_id')
                    m['validated_by'] = id_to_username.get(uid)
                    m.pop('validated_by_id', None)
        except Exception:
            pass

        commit_data = PRCommitsLogger.objects.filter(pr_number=prnumber, product=product, repo_name=reponame).order_by('-id')
        commit_items = list(commit_data.values())


        options = [v.value for v in ValidationStatus]

        final_response = {
            "monitor": monitor_items,
            "project_handler": "",
            "commits": commit_items,
            "validation_options": options,
            "status": True,
        }
        
        return final_response
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_more_pr_info.__name__} \n Exception:\n{ex}")
        return {}

def update_validation_status(prnumber, status, ticket_id=None, issue_reason=None):
    """Update validation status and related fields for a PR.

    Sets validator info from current user when available and timestamps the update.

    Args:
        prnumber (int|str): Pull request number to update.
        status (str|None): New validation status; coerced to lowercase when provided.
        ticket_id (str|None): Optional ticket/issue link or identifier.
        issue_reason (str|None): Optional free-form reason/details for issues found.

    Returns:
        bool: True if at least one row was updated; False otherwise.
    """
    try:
        user = get_current_user()

        update_fields = {}
        if status is not None:
            update_fields["validation_status"] = status.lower()
        if ticket_id is not None:
            update_fields["ticket_link"] = ticket_id
        if issue_reason is not None:
            update_fields["issue_reason"] = issue_reason

        if not update_fields:
            return False

        # Add validator info if we can resolve the user; set timestamp when we actually update
        if user and getattr(user, "email", None):
            try:
                dojo_user = Dojo_User.objects.get(email=user.email)
                update_fields["validated_by_id"] = dojo_user.id
            except Dojo_User.DoesNotExist:
                pass

        update_fields["validated_at"] = datetime.now()

        rows = PRMonitor.objects.filter(pr_number=prnumber).update(**update_fields)
        return bool(rows)
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {update_validation_status.__name__} \n Exception:\n{ex}")
        return False

def get_filter_values(status_values, selected):
    """Return PRs filtered by status list and selection scope.

    If FilterValues.ME is selected, restrict to PRs validated by the current user
    (when relation is available).

    Args:
        status_values (list[str]|None): Validation statuses to include.
        selected (iterable): Collection of FilterValues to apply (e.g., {FilterValues.ME}).

    Returns:
        list[dict]: Ordered list of PRs as dictionaries.
    """
    try:
        qs = PRMonitor.objects.all()

        if status_values:
            qs = qs.filter(validation_status__in=status_values)

        if FilterValues.ME in selected:
            user = get_current_user()
            if hasattr(user, 'email') and user.email:
                if hasattr(PRMonitor, 'validated_by'):
                    qs = qs.filter(validated_by__email=user.email)
                else:
                    pass

        qs = qs.order_by('-id')
        items = list(qs.values())
        return items
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_filter_values.__name__} \n Exception:\n{ex}")
        return list()

def get_product_list():
    """Return list of products with only their names.

    Returns:
        list[dict]: [{"name": str}, ...] or empty list on error.
    """
    try:
        qs = Product.objects.all().values("name")
        product_items = list(qs)
        return product_items
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_product_list.__name__} \n Exception:\n{ex}")
        return list()

def fetch_files_by_product():
    """Return all PRMonitorFiles entries ordered by newest first.

    Returns:
        list[dict]: List of file configuration rows.
    """
    try:
        qs = PRMonitorFiles.objects.all()
        qs = qs.order_by("-id")
        items = list(qs.values())
        return items
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {fetch_files_by_product.__name__} \n Exception:\n{ex}")
        return list()

def add_critical_files(product_name, repo_name, file_names, unique_id):
    """Create a PRMonitorFiles record for a product/repo with critical file names.

    Args:
        product_name (str): Product name to link.
        repo_name (str): Repository name to link.
        file_names (str): Serialized file names (format defined by model/consumer).
        unique_id (str): Unique identifier for this configuration.

    Returns:
        None
    """
    try:
        PRMonitorFiles.objects.create(
            unique_id = unique_id,
            product = Product.objects.get(name = product_name),
            file_names = file_names,
            repo_name = repo_name
        )
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {add_critical_files.__name__} \n Exception:\n{ex}")
        return None

def update_critical_files(product_name, repo_name, file_names, unique_id):
    """Update or create PRMonitorFiles for the given unique_id.

    Args:
        product_name (str): Product name to associate.
        repo_name (str): Repository name to associate.
        file_names (str|None): Serialized file names; uses '' if creating and None provided.
        unique_id (str): Unique identifier for the configuration record.

    Returns:
        bool: True on successful update or create; False on error.
    """
    try:
        if not product_name or not repo_name:
            return False
        product = Product.objects.get(name=product_name)
        updated = PRMonitorFiles.objects.filter(unique_id=unique_id).update(
            file_names=file_names,
            product = product,
            repo_name = repo_name
            )
        if updated:
            return True
        PRMonitorFiles.objects.create(
            product=product,
            file_names=file_names or '',
            repo_name=repo_name
        )
        return True
    except Product.DoesNotExist as ex:
        logger.exception(f"[-] Exception occurred \n Method: {update_critical_files.__name__} \n Exception:\n{ex}")
        return False
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {update_critical_files.__name__} \n Exception:\n{ex}")
        return False

def delete_critical_files(unique_id):
    """Delete PRMonitorFiles by unique identifier.

    Args:
        unique_id (str): Unique identifier to delete by.

    Returns:
        bool: True if a record was deleted; False otherwise or on error.
    """
    try:
        deleted = PRMonitorFiles.objects.filter(unique_id=unique_id).delete()
        if deleted:
            return True
        else:
            return False
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {delete_critical_files.__name__} \n Exception:\n{ex}")
        return False
    
def get_project_handler_info():
    """Return normalized project handler info with product and user details.

    Returns:
        list[dict]: [{id, product, handled_by_id, handled_by, handled_by_email}, ...]
    """
    try:
        # Join related Product and Dojo_User so we can expose names instead of only ids
        qs = PRProjectHandler.objects.select_related("product", "handled_by")
        raw = list(qs.values(
            "id",
            "product__name",
            "handled_by_id",
            "handled_by__username",
            "handled_by__email",
        ))

        # Normalize keys for a cleaner payload
        info = []
        for row in raw:
            info.append({
                "id": row.get("id"),
                "product": row.get("product__name"),
                "handled_by_id": row.get("handled_by_id"),
                "handled_by": row.get("handled_by__username"),
                "handled_by_email": row.get("handled_by__email"),
            })
        return info
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_project_handler_info.__name__} \n Exception:\n{ex}")
        return []

def get_all_users_list():
    """Return all users with id, username, and email sorted by username.

    Returns:
        list[dict]: List of user dictionaries or empty list on error.
    """
    try:
        qs = Dojo_User.objects.all().order_by("username")
        user_list = list(qs.values("id","username", "email"))
        return user_list
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_all_users_list.__name__} \n Exception:\n{ex}")
        return list()

def assign_product_for_user(userid, product):
    """Create a PRProjectHandler assignment linking a user to a product.

    Args:
        userid (int): Dojo_User id to assign.
        product (str): Product name to assign.
    """
    try:
        PRProjectHandler.objects.create(
            handled_by = Dojo_User.objects.get(id=userid),
            product = Product.objects.get(name=product)
        )
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {assign_product_for_user.__name__} \n Exception:\n{ex}")

def delete_product_handler_by_id(handler_id):
    """Delete a PRProjectHandler by id.

    Args:
        handler_id (int|str|None): Identifier of the handler row.

    Returns:
        tuple: (count, details) from Django's delete(); (0, {}) on invalid id or error.
    """
    try:
        if handler_id is None or str(handler_id).strip() == "":
            return (0, {})
        return PRProjectHandler.objects.filter(id=handler_id).delete()
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {delete_product_handler_by_id.__name__} \n Exception:\n{ex}")
        return (0, {})

