import logging
import json

from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views import View


from dojo.gitea_webhook.helper import GiteaHookPayloadParser, GiteaPrInfo, PRStatus
from dojo.gitea_webhook.queries import add_new_pr, add_new_commits, update_new_pr_info_on_edit

logger = logging.getLogger(__name__)

@method_decorator(csrf_exempt, name='dispatch')
class GiteaHookHanlder(View):
    def post(self, request):
        """
        Handle Gitea pull request webhooks.

        Expects a JSON payload in the request body from Gitea. The payload is parsed
        into a GiteaPrInfo via GiteaHookPayloadParser and routed based on PR action:
        - PRStatus.OPEN   -> add_new_pr
        - PRStatus.SYNC   -> add_new_commits
        - PRStatus.EDITED, PRStatus.CLOSED, PRStatus.REOPEN -> update_new_pr_info_on_edit

        Returns:
            200 JSON {"Status": true} when processing succeeds
            500 JSON {"Status": false} on errors or invalid payloads
        """
        try:
            logger.info("[+] recived webhook request")
            data_string = request.body.decode('utf-8')
            data = json.loads(data_string)
            
            parsed_data: GiteaPrInfo = GiteaHookPayloadParser.from_json(data)
            status = False
            if parsed_data:
                if parsed_data.action == PRStatus.OPEN:
                    status = add_new_pr(parsed_data)

                elif parsed_data.action == PRStatus.SYNC:
                    status = add_new_commits(parsed_data)

                elif parsed_data.action == PRStatus.EDITED or parsed_data.action == PRStatus.EDITED or parsed_data.action == PRStatus.CLOSED or parsed_data.action == PRStatus.REOPEN:
                    status = update_new_pr_info_on_edit(parsed_data)
            if status:
                return JsonResponse({"Status": status}, status=200)
            
        except Exception as ex:
            logger.exception("[-] Exception occured on webhook \n Exception Info: \n "+ex)
        return JsonResponse({"Status": False,}, status=500)
    
    def get(self, request):
        logger.error("[-] Received GET Request on Webhook")
        return JsonResponse({"Status": "Method not allowed"}, status = 405)
