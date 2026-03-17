from pathlib import Path
from django.conf import settings
import requests
from django.http import HttpResponse
from bs4 import BeautifulSoup
from django.http import HttpRequest

    

def save_html_report(htmlContent: str, request: HttpRequest):
    """ This method help to save the custom designed HTML report as HTML file
    """
    report_name = None
    coverPageContent = remove_or_get_demand_div(htmlContent, True)
    htmlContent = remove_or_get_demand_div(htmlContent)
    htmlContent = remove_script_blocks(htmlContent)
    htmlContent = convert_images_to_base64(htmlContent, request)

    export_dir = Path(settings.MEDIA_ROOT) / "export"
    export_dir.mkdir(parents=True, exist_ok=True)
    report_filePath = export_dir / "report.html"
    coverPage_filePath = export_dir / "coverpage.html"
    
    with open(report_filePath, "w", encoding="utf-8") as f:
        f.write(htmlContent)
    
    with open(coverPage_filePath, "w", encoding="utf-8") as f:
        f.write(coverPageContent)
    

def generate_pdf(request: HttpRequest):
    """ This method will make external API call to genreate PDF using Syncfusion.PDF tool
    """
    current_user_session_token = get_cookie_from_request(request)

    url = f"{settings.PDF_EXPORT_SERVICE}?report={settings.SITE_URL}/reports/render_report&coverpage={settings.SITE_URL}/reports/render_cover_page&sessionid={current_user_session_token}"
    response = requests.get(url)
    if response.status_code == 200:
        pdf_response = HttpResponse(response.content, content_type='application/pdf')
        pdf_response['Content-Disposition'] = 'attachment; filename="VAPT_Report.pdf"'
        return pdf_response
    else:
        response.raise_for_status()

def remove_or_get_demand_div(htmlContent: str, isCoverPage: bool = False) -> str:
    """ This method help to remove the custom download icon style while saving custom report
    html content.    
    """
    soup = BeautifulSoup(htmlContent, "html.parser")
    coverPage_content = soup.find("div", id="cover_page")
    if isCoverPage:
        return str(coverPage_content)

    div = soup.find("div", id="on-demand-icon")
    if div:
        div.decompose()

    if coverPage_content:
        coverPage_content.decompose()

    return str(soup)

def remove_script_blocks(htmlContent: str) -> str:
    soup = BeautifulSoup(htmlContent, "html.parser")

    for script in soup.find_all("script"):
        script.decompose()

    return str(soup)

def convert_images_to_base64(htmlContent: str, request: HttpRequest) -> str:
    import base64
    from urllib.parse import urljoin, urlparse

    soup = BeautifulSoup(htmlContent, "html.parser")

    for img in soup.find_all("img"):
        src = img.get("src")
        if not src:
            continue

        try:
            if not urlparse(src).netloc:
                src = urljoin(settings.SITE_URL, src)
            cookies = {}
            
            cookies["sessionid"] = get_cookie_from_request(request)

            response = requests.get(src, timeout=10, cookies=cookies)
            response.raise_for_status()

            content_type = response.headers.get('content-type', 'image/png')

            image_base64 = base64.b64encode(response.content).decode('utf-8')

            data_url = f"data:{content_type};base64,{image_base64}"

            img['src'] = data_url

        except Exception as e:
            print(f"Error converting image {src} to base64: {e}")
            continue

    return str(soup)

def get_cookie_from_request(request: HttpRequest) -> str:
    if hasattr(request, 'COOKIES') and request.COOKIES:
        session_cookie_name = getattr(settings, 'SESSION_COOKIE_NAME', 'sessionid')
        if session_cookie_name in request.COOKIES:
            return request.COOKIES[session_cookie_name]
    return ""