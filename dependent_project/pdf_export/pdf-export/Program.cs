var builder = WebApplication.CreateBuilder(args);
var syncfusionLicenseKey = builder.Configuration["SyncfusionLicenseKey"];
builder.Services.AddSingleton<pdf_export.Controller.SyncfusionLicenseProviderOptions>(provider =>
    new pdf_export.Controller.SyncfusionLicenseProviderOptions(syncfusionLicenseKey));
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", builder =>
    {
        builder.AllowAnyOrigin()
               .AllowAnyMethod()
               .AllowAnyHeader();
    });
});
builder.Services.AddSwaggerGen();
builder.Services.AddOpenApi();
builder.Services.AddControllers();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseCors("AllowAll");

app.UseRouting();
app.UseEndpoints(endpoints => { endpoints.MapControllers(); });

app.Run();
