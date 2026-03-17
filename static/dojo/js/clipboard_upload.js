// static/dojo/js/clipboard_upload.js
document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("paste", function (event) {
        const items = (event.clipboardData || event.originalEvent.clipboardData).items;

        for (let index in items) {
            const item = items[index];
            if (item.kind === "file") {
                const blob = item.getAsFile();

                // Get finding ID from a global JS variable or a hidden input
                findingId = window.findingId || document.getElementById("finding-id")?.value;
                page = document.getElementById("page")?.value;
                //Add finding page will not contain finding id so skipping it.
                if (page != "add_findings")
                {
                    if (!findingId) {
                    console.error("Finding ID not found.");
                    return;
                    }
                }
                else
                {
                    findingId = 0;
                }
                
                const origin = document.getElementById("origin_source")?.value;
                if (!origin) {
                    origin = "unknown";
                }
                const formData = new FormData();
                formData.append("image", blob);
                formData.append("finding_id", findingId);
                formData.append('origin_source', origin);

                fetch("/upload_image/", {
                    method: "POST",
                    body: formData,
                    headers: {
                        "X-CSRFToken": getCookie("csrftoken"),
                    },
                })
                .then(response => response.json())
                .then(data => {
                    if (data.image_url) {
                        insertImageMarkdown(data.image_url);
                    }
                });
            }
        }
    });
});

function insertImageMarkdown(url) {
    const fullUrl = `${window.location.origin}/${url.replace(/^\/+/, "")}`;
    const imageMarkdown = `\n\n![Pasted Image](${fullUrl})\n\n`;

    // Find the focused CodeMirror editor
    const editors = document.querySelectorAll(".CodeMirror");

    for (const editorEl of editors) {
        const cm = editorEl.CodeMirror;
        if (cm && cm.hasFocus && cm.hasFocus()) {
            cm.replaceSelection(imageMarkdown);
            return;
        }
    }

    console.warn("No focused CodeMirror editor found.");
}


function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== "") {
        const cookies = document.cookie.split(";");
        for (let cookie of cookies) {
            cookie = cookie.trim();
            if (cookie.startsWith(name + "=")) {
                cookieValue = decodeURIComponent(cookie.slice(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
//test