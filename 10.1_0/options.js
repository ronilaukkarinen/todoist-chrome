// Saves options to chrome.storage
function save_options() {
    var withDueToday = document.getElementById("with_due_today").checked
    chrome.storage.sync.set(
        {
            withDueToday: withDueToday
        },
        function() {
            // Update status to let user know options were saved.
            var status = document.getElementById("status")
            status.textContent = i18nUtils.getMessage("optionsSaved", "Saved")
            setTimeout(function() {
                status.textContent = ""
            }, 750)
        }
    )
}

// Restores select box and checkbox state using the preferences
// stored in chrome.storage.
function restore_options() {
    i18nUtils.localizeHTML()
    chrome.storage.sync.get(["withDueToday"], function(items) {
        document.getElementById("with_due_today").checked = items.withDueToday
        document
            .getElementById("with_due_today")
            .addEventListener("change", save_options)
    })
}

document.addEventListener("DOMContentLoaded", restore_options)
