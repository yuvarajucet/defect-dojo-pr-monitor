using Microsoft.AspNetCore.Mvc;
using Syncfusion.HtmlConverter;
using Syncfusion.Pdf;
using Syncfusion.Pdf.Graphics;
using Syncfusion.Drawing;
using Syncfusion.Licensing;
using Syncfusion.Pdf.HtmlToPdf;
using Syncfusion.Pdf.Parsing;

namespace pdf_export.Controller;

[ApiController]
[Route("api/[controller]")]
public class ExportController : Microsoft.AspNetCore.Mvc.Controller
{
    private readonly string _syncfusionLicenseKey;
    public ExportController(SyncfusionLicenseProviderOptions options) {
        _syncfusionLicenseKey = options.LicenseKey;
        SyncfusionLicenseProvider.RegisterLicense(_syncfusionLicenseKey);
    }
    
    [HttpGet]
    [Route("link-to-pdf")]
    public IActionResult GeneratePdf(string coverpage, string report, string sessionid)
    {
        try
        {
            // Initialize PDF document
            PdfDocument customReport = new PdfDocument();
            customReport.PageSettings.Margins.All = 0;
            // Create Cover Page PDF content
            HtmlToPdfConverter coverPageConverter = new HtmlToPdfConverter();
            BlinkConverterSettings coverPageBlinkSettings = new BlinkConverterSettings();
            coverPageBlinkSettings.EnableToc = true;
            coverPageBlinkSettings.Margin.All = 0;
            coverPageBlinkSettings.Scale = 0.9f;
            
            
            // Create Converter and blinker settings.
            HtmlToPdfConverter htmlConverter = new HtmlToPdfConverter();
            BlinkConverterSettings blinkConverterSettings = new BlinkConverterSettings();
            

            // Add table of content and it's style
            blinkConverterSettings.EnableToc = true;
            HtmlToPdfToc toc = new HtmlToPdfToc();
            toc.StartingPageNumber = 1;
            toc.TitleAlignment = PdfTextAlignment.Center;
            HtmlToPdfTocStyle style = new HtmlToPdfTocStyle();
            style.Font = new PdfStandardFont(PdfFontFamily.Helvetica, 12);
            style.ForeColor = new PdfSolidBrush(Color.Navy);
            toc.TitleStyle = style;
            blinkConverterSettings.Toc = toc;

            // Create header area and PDF template
            PdfPageTemplateElement header = new PdfPageTemplateElement(new RectangleF(0, 0, blinkConverterSettings.PdfPageSize.Width, 20));
            blinkConverterSettings.PdfHeader = header;
            blinkConverterSettings.Margin.Right = 20;
            blinkConverterSettings.Margin.Left = 20;
            blinkConverterSettings.Scale = 1.0f;


            coverPageBlinkSettings.Cookies.Add("sessionid", sessionid);
            coverPageConverter.ConverterSettings = coverPageBlinkSettings;
            
            blinkConverterSettings.Cookies.Add("sessionid", sessionid);
            htmlConverter.ConverterSettings = blinkConverterSettings;
            
            PdfDocument coverPage = coverPageConverter.Convert(coverpage);
            PdfDocument reportPage = htmlConverter.Convert(report);

            FileStream coverPageFileStream = new FileStream(Path.GetTempFileName(), FileMode.Create, FileAccess.ReadWrite);
            coverPage.Save(coverPageFileStream);
            coverPage.Close(true);
            
            FileStream fileStream = new FileStream(Path.GetTempFileName(), FileMode.Create, FileAccess.ReadWrite);
            reportPage.Save(fileStream);
            reportPage.Close(true);

            PdfLoadedDocument coverPageDocumentor = new PdfLoadedDocument(coverPageFileStream);
            customReport.Append(coverPageDocumentor);
            
            PdfLoadedDocument customReportDocumentor = new PdfLoadedDocument(fileStream);
            customReport.Append(customReportDocumentor);

            MemoryStream customReportProducer = new MemoryStream();
            customReport.Save(customReportProducer);
            

            // Add page number at footer
            PdfLoadedDocument pdfLoadedDocument = new PdfLoadedDocument(customReportProducer);
            RectangleF bounds = new RectangleF(0, 0, pdfLoadedDocument.Pages[0].Size.Width, 50);
            PdfPageTemplateElement footer = new PdfPageTemplateElement(bounds);
            PdfBrush fotterBrush = new PdfSolidBrush(Color.Black);
            PdfFont font = new PdfStandardFont(PdfFontFamily.Helvetica, 7);
            PdfPageNumberField fotterpageNumber = new PdfPageNumberField(font, fotterBrush);
            PdfPageCountField footerCount = new PdfPageCountField(font, fotterBrush);
            PdfCompositeField footercompositeField = new PdfCompositeField(font, fotterBrush, "Page {0} of {1}", fotterpageNumber, footerCount);
            footercompositeField.Bounds = footer.Bounds;
            footercompositeField.Draw(footer.Graphics, new PointF(530, 15));
            customReport.Template.Bottom= footer;
            MemoryStream finalPdfStream = new MemoryStream();

            customReport.Save(finalPdfStream);


            return File(finalPdfStream.ToArray(), "application/pdf", "Output.pdf");
        }
        catch (Exception ex)
        {
            Console.WriteLine("Exception: {0}", ex.ToString());
            return StatusCode(500, "Internal server error");
        }
    }
    
}

public class SyncfusionLicenseProviderOptions
{
    public string LicenseKey { get; }
    public SyncfusionLicenseProviderOptions(string licenseKey)
    {
        LicenseKey = licenseKey;
    }
}
