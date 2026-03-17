from django.shortcuts import render, redirect
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.urls import reverse
import json
import uuid
import logging

from dojo.utils import add_breadcrumb
from dojo.pr_monitor.queries import (
    get_pr_list_for_view,
    get_more_pr_info,
    update_validation_status,
    get_filter_values as query_get_filter_values,
    fetch_files_by_product,
    get_product_list as query_get_product_list,
    add_critical_files as query_add_critical_files,
    update_critical_files as query_update_critical_files,
    delete_critical_files as query_delete_critical_files,
    get_project_handler_info as query_get_project_handler_info,
    get_all_users_list as query_get_all_users_list,
    assign_product_for_user as query_assign_product_for_user,
    delete_product_handler_by_id as query_delete_product_handler_by_id
)
from dojo.gitea_webhook.helper import ValidationStatus
from dojo.pr_monitor.helper import (
    parse_filter_values,
    filtervalues_to_validation_status,
    get_filter_values as helper_get_filter_values
)

logger = logging.getLogger(__name__)

#Region: Helper methods
def get_last_segment(request):
    """
    Extracts and returns the last segment of the request path, capitalized.

    Args:
        request (HttpRequest): The incoming Django request object.

    Returns:
        str: The last path segment (capitalized). Returns an empty string for root or on error.
    """
    try:
        path = request.path
        last_segment = path.rstrip('/').split('/')[-1] if path != '/' else ''
        return last_segment.capitalize()
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_last_segment.__name__} \n Exception:\n{ex}")
        return ''

#Region: New PR page handler

def get_new_pr(request):
    """
    Renders the New PR page with a list of PRs that are not validated yet.

    Reads optional query parameter 'filters' to enable critical-only filtering.

    Args:
        request (HttpRequest): The incoming request containing optional query params.

    Returns:
        HttpResponse: Rendered template "dojo/pr_monitor/pr_template.html" with context
        including PR list and UI flags.
    """
    try:
        title = get_last_segment(request)
        add_breadcrumb(title=title, top_level=not len(request.GET), request=request)

        context = None
        critical_only_filter = False
        if request.GET.get('filters') is not None:
            raw = request.GET.get('filters')
            s = str(raw).strip().lower()
            critical_only_filter = s in ("true", "TRUE", "True")

        context = get_pr_list_for_view(ValidationStatus.NONE, filter=critical_only_filter)
        return render(request, "dojo/pr_monitor/pr_template.html", {"pr_list": context, "show_validated_filter": False})
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_new_pr.__name__} \n Exception:\n{ex}")
        return render(request, "dojo/pr_monitor/pr_template.html", {"pr_list": [], "show_validated_filter": False})

def get_pr_details(request, prnumber, product, reponame):
    """
    Returns extended PR details for a given PR number, product, and repository.

    Args:
        request (HttpRequest): The incoming request.
        prnumber (int|str): Pull request number.
        product (str): Product name.
        reponame (str): Repository name.

    Returns:
        JsonResponse: PR details as JSON on success, or empty JSON on error.
    """
    try:
        pr_info = get_more_pr_info(prnumber, product, reponame)
        return JsonResponse(pr_info, safe=False)
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_pr_details.__name__} \n Exception:\n{ex}")
        return JsonResponse({}, safe=False)

@csrf_exempt
@require_http_methods(["POST"])
def update_pr_validation(request, prnumber):
    """
    Updates a PR's validation status.

    Expects a JSON body with keys:
      - validation_status (str): Required. One of allowed ValidationStatus values.
      - ticket_link (str|None): Optional ticket/issue link or id.
      - issue_reason (str|None): Optional reason when marking as issue.

    Args:
        request (HttpRequest): The POST request with JSON payload.
        prnumber (int|str): PR number to update.

    Returns:
        JsonResponse: {status: bool, message|error, allowed?}. 400 on bad input, 500 on error.
    """
    try:
        try:
            raw = request.body.decode("utf-8") if request.body else "{}"
            payload = json.loads(raw or "{}")
        except json.JSONDecodeError:
            return JsonResponse({"status": False, "error": "Invalid JSON body"}, status=400)

        def _none_if_blank(v):
            if isinstance(v, str):
                v = v.strip()
                return v if v else None
            return v if v is not None else None

        status_value = _none_if_blank(payload.get("validation_status"))
        ticket_value = _none_if_blank(payload.get("ticket_link"))
        issue_reason = _none_if_blank(payload.get("issue_reason"))

        try:
            allowed = [v.value.lower() for v in ValidationStatus]
        except Exception:
            allowed = None

        if not status_value:
            return JsonResponse({"status": False, "error": "Missing 'status'"}, status=400)

        if allowed is not None and status_value.lower() not in allowed:
            return JsonResponse({"status": False, "error": "Invalid status", "allowed": allowed}, status=400)

        updated = update_validation_status(prnumber, status_value, ticket_id=ticket_value, issue_reason=issue_reason)
        return JsonResponse({"status": bool(updated), "message": "Status updated!"})
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {update_pr_validation.__name__} \n Exception:\n{ex}")
        return JsonResponse({"status": False, "error": "Internal error"}, status=500)


# Region: Validated PR page handler

def get_validated_pr(request):
    """
    Renders the Validated PR page with PRs that have already been validated.

    Supports optional 'filters' query parameter to show only critical PRs.

    Args:
        request (HttpRequest): The incoming request containing optional query params.

    Returns:
        HttpResponse: Rendered template with validated PR list.
    """
    try:
        title = get_last_segment(request)
        add_breadcrumb(title=title, top_level=not len(request.GET), request=request)

        context = None
        critical_only_filter = False
        if request.GET.get('filters'):
            raw = request.GET.get('filters')
            s = str(raw).strip().lower()
            critical_only_filter = s in ("true", "TRUE", "True")
            
            # Turning off custom filter
            # raw = request.GET.get('filters')
            # selected = parse_filter_values(raw)
            # status_values = filtervalues_to_validation_status(selected)
            # context = query_get_filter_values(status_values, selected)
        #else:
        context = get_pr_list_for_view(ValidationStatus.NONE, True, filter=critical_only_filter)

        return render(request, "dojo/pr_monitor/pr_template.html", {"pr_list": context, "show_validated_filter": False})
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_validated_pr.__name__} \n Exception:\n{ex}")
        return render(request, "dojo/pr_monitor/pr_template.html", {"pr_list": [], "show_validated_filter": False})

def get_filter_values(request):
    """
    Returns available filter values used by the PR monitor UI.

    Args:
        request (HttpRequest): The incoming request.

    Returns:
        JsonResponse: {"filters": list} of filter metadata; empty list on error.
    """
    try:
        data = helper_get_filter_values()
        return JsonResponse({"filters": data})
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_filter_values.__name__} \n Exception:\n{ex}")
        return JsonResponse({"filters": []})


#Region: Settings page

def monitor_settings(request):
    """
    Renders the PR Monitor Settings page.

    Args:
        request (HttpRequest): The incoming request.

    Returns:
        HttpResponse: Rendered settings page.
    """
    try:
        title = get_last_segment(request)
        add_breadcrumb(title=title, top_level=not len(request.GET), request=request)
        return render(request, "dojo/pr_monitor/settings.html")
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {monitor_settings.__name__} \n Exception:\n{ex}")
        return render(request, "dojo/pr_monitor/settings.html")

# Settings -> Critical Files

def get_files_by_product(request):
    """
    Returns critical file entries grouped by product.

    Args:
        request (HttpRequest): The incoming request.

    Returns:
        JsonResponse: {status: bool, Data: list} with product-file mappings.
    """
    try:
        product_file_list = fetch_files_by_product()
        return JsonResponse({"status": True, "Data": product_file_list})
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_files_by_product.__name__} \n Exception:\n{ex}")
        return JsonResponse({"status": False, "Data": []})

def get_product_list(requst):
    """
    Returns the list of product names used in PR monitoring.

    Note: Parameter name is 'requst' for compatibility with existing code.

    Args:
        requst (HttpRequest): The incoming request.

    Returns:
        JsonResponse: {status: bool, Data: list[str]} of product names.
    """
    try:
        product_name_list = query_get_product_list()
        return JsonResponse({"status": True, "Data": product_name_list})
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_product_list.__name__} \n Exception:\n{ex}")
        return JsonResponse({"status": False, "Data": []})

@require_http_methods(["POST"])
def add_product_file_list(request):
    """
    Creates a new critical-file mapping entry for a product/repository.

    Form fields:
      - product_name (str) required
      - reponame (str) required
      - filenames (str) comma-separated list of file paths

    Args:
        request (HttpRequest): POST request with form data.

    Returns:
        HttpResponseRedirect: Redirects to the settings page.
    """
    try:
        def _clean_str(v):
            if v is None:
                return None
            v = str(v).strip()
            return v or None

        product_name = _clean_str(request.POST.get("product_name"))
        repo_name = _clean_str(request.POST.get("reponame"))
        filenames = _clean_str(request.POST.get("filenames"))
        file_list = [s.strip() for s in filenames.split(",")] if filenames else []
        unique_id = uuid.uuid4()

        
        query_add_critical_files(product_name, repo_name, filenames, unique_id)

        return redirect("settings")
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {add_product_file_list.__name__} \n Exception:\n{ex}")
        return redirect("settings")


@require_http_methods(["POST"])
def update_product_file_list(request):
    """
    Updates an existing critical-file mapping entry identified by unique_id.

    Form fields:
      - product_name (str)
      - reponame (str)
      - filenames (str) comma-separated list of file paths
      - unique_id (str) identifier of the record to update

    Args:
        request (HttpRequest): POST request with form data.

    Returns:
        HttpResponseRedirect: Redirects to the settings page.
    """
    try:
        def _clean_str(v):
            if v is None:
                return None
            v = str(v).strip()
            return v or None

        product_name = _clean_str(request.POST.get("product_name"))
        repo_name = _clean_str(request.POST.get("reponame"))
        filenames = _clean_str(request.POST.get("filenames"))
        unique_id = _clean_str(request.POST.get("unique_id"))

        result = query_update_critical_files(product_name, repo_name.lower(), filenames, unique_id)

        return redirect("settings")
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {update_product_file_list.__name__} \n Exception:\n{ex}")
        return redirect("settings")

@require_http_methods(["POST"])
def delete_product_file_list(request):
    """
    Deletes a critical-file mapping entry by unique_id.

    Form fields:
      - unique_id (str) required

    Args:
        request (HttpRequest): POST request with form data.

    Returns:
        HttpResponseRedirect: Redirects to the settings page.
    """
    try:
        def _clean_str(v):
            if v is None:
                return None
            v = str(v).strip()
            return v or None

        unique_id = _clean_str(request.POST.get("unique_id"))

        result = query_delete_critical_files(unique_id)
        return redirect("settings")
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {delete_product_file_list.__name__} \n Exception:\n{ex}")
        return redirect("settings")

# Settings -> Project Handler

def get_project_handler_info(request):
    """
    Returns list of project handler assignments.

    Args:
        request (HttpRequest): The incoming request.

    Returns:
        JsonResponse: {status: bool, data: list} of handler records.
    """
    try:
        handler_list = query_get_project_handler_info()
        return JsonResponse({"status": True, "data": handler_list})
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_project_handler_info.__name__} \n Exception:\n{ex}")
        return JsonResponse({"status": False, "data": []})

def get_users_list(request):
    """
    Returns available users who can be assigned as project handlers.

    Args:
        request (HttpRequest): The incoming request.

    Returns:
        JsonResponse: {status: bool, data: list} of users.
    """
    try:
        user_list = query_get_all_users_list()
        return JsonResponse({"status": True, "data": user_list})
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {get_users_list.__name__} \n Exception:\n{ex}")
        return JsonResponse({"status": False, "data": []})

@require_http_methods(["POST"]) 
def assign_product_for_user(request):
    """
    Assigns a product to a user as project handler and redirects to settings.

    Form fields:
      - product_name (str) required
      - handled_by (str|int) required (user identifier)

    Args:
        request (HttpRequest): POST request with form data.

    Returns:
        HttpResponseRedirect: Redirects to settings view=ph.
    """
    settings_url = f"{reverse('settings')}?view=ph"
    try:
        product_name = request.POST.get("product_name")
        handled_by = request.POST.get("handled_by")
        query_assign_product_for_user(handled_by, product_name)
        return redirect(settings_url)
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {assign_product_for_user.__name__} \n Exception:\n{ex}")
        return redirect(settings_url)

@csrf_exempt
@require_http_methods(["POST"])
def delete_product_for_user(request):
    """
    Removes a project handler assignment by id and redirects to settings.

    Form fields:
      - id (str|int) required: the handler assignment identifier.

    Args:
        request (HttpRequest): POST request with form data.

    Returns:
        HttpResponseRedirect: Redirects to settings view=ph.
    """
    settings_url = f"{reverse('settings')}?view=ph"
    try:
        handler_id = request.POST.get("id")
        if not handler_id:
            return JsonResponse({"status": False, "error": "Missing id"}, status=400)

        status = query_delete_product_handler_by_id(handler_id)
        return redirect(settings_url)
    except Exception as ex:
        logger.exception(f"[-] Exception occurred \n Method: {delete_product_for_user.__name__} \n Exception:\n{ex}")
        return redirect(settings_url)

