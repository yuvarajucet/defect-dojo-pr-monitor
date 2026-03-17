from django.urls import re_path
from dojo.gitea_webhook import views

urlpatterns = [
    # webhook URL which receive event calls from Gitea / Github
    re_path(r"^giteawebhook/trigger/?$", views.GiteaHookHanlder.as_view(), name="webhook_handler")
]