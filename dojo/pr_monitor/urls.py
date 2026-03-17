from django.urls import re_path
from dojo.pr_monitor import views

urlpatterns = [
    # new PR routes
    re_path(r"^prmonitor/new$", views.get_new_pr, name="new"),
    re_path(r"^prmonitor/getinfo/(?P<product>[^/]+)/(?P<reponame>[^/]+)/(?P<prnumber>\d+)$", views.get_pr_details, name="get_pr_details"),
    re_path(r"^prmonitor/update_validation/(?P<prnumber>\d+)$", views.update_pr_validation, name="update_pr_validation"),

    # Validated PR routes
    re_path(r"^prmonitor/validated$", views.get_validated_pr, name="validated_pr"),
    re_path(r"^prmonitor/getfiltervalues$", views.get_filter_values, name="get_filter_values"),

    # Setings routes
    # Settings -> Critical files
    re_path(r"^prmonitor/settings$", views.monitor_settings, name="settings"),
    re_path(r"^prmonitor/settings/add_product_files$", views.add_product_file_list, name="add_product_list"),
    re_path(r"^prmonitor/settings/get_product_files$", views.get_files_by_product, name="get_files_by_product"),
    re_path(r"^prmonitor/settings/get_product_list$", views.get_product_list, name="get_product_list"),
    re_path(r"^prmonitor/settings/update_product_files$", views.update_product_file_list, name="update_product_file_list"),
    re_path(r"^prmonitor/settings/delete_product_files$", views.delete_product_file_list, name="delete_product_file_list"),

    # Settings -> Project Handler
    re_path(r"^prmonitor/settings/ph/get_ph_info$", views.get_project_handler_info, name="get_project_handler_info"),
    re_path(r"^prmonitor/settings/ph/get_users_list$", views.get_users_list, name="get_users_list"),
    re_path(r"^prmonitor/settings/ph/assign_product$", views.assign_product_for_user, name="assign_product_for_user"),
    re_path(r"^prmonitor/settings/ph/delete_product$", views.delete_product_for_user, name="delete_product_for_user"),
]
