// These consts will be replaced during build with Gulp
const DOMAIN = "chrome.todoist.com"
const REVIEW_URL = "https://chrome.google.com/webstore/detail/todoist-to-do-list-and-ta/jldhpllghnbhlbpcmnajkpdmadaolakh/reviews"
const TOOLTIP_NAME = "chrome_rating"

window.addEventListener(
    "message",
    function(e) {
        window.BG_PAGE = chrome.extension.getBackgroundPage()
        let str_data = e.data

        if (str_data && str_data.indexOf("SWITCH_URL:") != -1) {
            str_data = str_data.replace("SWITCH_URL:", "")

            chrome.tabs.getSelected(null, function(tab) {
                if (tab) {
                    chrome.tabs.update(tab.id, { url: str_data })
                }
            })
        } else if (str_data && str_data.indexOf("DISABLE_TOOLTIP:") != -1) {
            RateMe.disable()
            RateMe.disableViaAjax()
        } else if (str_data && str_data.indexOf("RESET_TOOLTIP:") != -1) {
            RateMe.reset()
        } else if (str_data.match(/^https?/)) {
            window.BG_PAGE.setFrameLocation(str_data)
        }
    },
    false
)

function init() {
    chrome.tabs.create({'url': 'https://todoist.com'}, function(tab) {});
    window.BG_PAGE = chrome.extension.getBackgroundPage()
    window.TODOIST_FRAME = document.getElementById("todoist_frame")

    const last_location = window.BG_PAGE.getFrameLocation()

    if (last_location && last_location.indexOf("todoist.com/app") != -1)
        window.TODOIST_FRAME.src = last_location
    else window.TODOIST_FRAME.src = "https://" + DOMAIN + "/?mini=1"

    setInterval(postLocationAndTitle, 200)
    setInterval(RateMe.maybeShow, 1000)

    RateMe.increaseOpenCount()
}

function postLocationAndTitle() {
    const cur_location = window.BG_PAGE.getCurrentLocationAndTitle()
    const data_to_send = cur_location.location + "--/--" + cur_location.title
    window.TODOIST_FRAME.contentWindow.postMessage(data_to_send, "*")
}

document.addEventListener("DOMContentLoaded", function() {
    init()
})

/*
 * Rating counter
 * ----
 * Every 15th open we check to see if we should present a tip
 * to the user asking to rate us.
 *
 * This data is stored locally.
 */
const RateMe = {
    // How many opens do the user need to do before we ask them to
    // rate us.
    show_on_open: 15,

    increaseOpenCount: function() {
        const session = window.BG_PAGE.getSession()

        if (session["rating_disabled"] == "yes") return

        let cur_count = parseInt(session["open_count"]) || 0
        cur_count++

        RateMe.open_count = session["open_count"] = cur_count
    },

    maybeShow: function() {
        if (window.BG_PAGE.getSession()["rating_disabled"] == "yes") return

        if (RateMe.open_count >= RateMe.show_on_open) {
            if (RateMe.server_seen_value == "not_seen") RateMe.showTooltip()
            else RateMe.setShouldShowTooltip()
        }
    },

    disable: function() {
        const session = window.BG_PAGE.getSession()
        session["rating_disabled"] = "yes"
    },

    disableViaAjax: function() {
        doGetRequest(
            "https://" + DOMAIN + "/Tooltips/markAsSeen?name=" + TOOLTIP_NAME
        )
    },

    showTooltip: function() {
        const todoist_frame = document.getElementById("todoist_frame")
        const iframe_loc = window.BG_PAGE.getFrameLocation()

        if (iframe_loc && iframe_loc.indexOf("/app") != -1) {
            const msg = JSON.stringify({
                type: "USER_TOOLTIP",
                message: "rate_chrome_plugin",
                action_url: REVIEW_URL
            })

            todoist_frame.contentWindow.postMessage(msg, "*")
        }
    },

    server_seen_value: undefined,
    setShouldShowTooltip: function() {
        doGetRequest(
            "https://" + DOMAIN + "/Tooltips/isSeen?name=" + TOOLTIP_NAME,
            function(xhr) {
                const text = xhr.responseText

                if (text == "not_seen") {
                    RateMe.server_seen_value = "not_seen"
                    RateMe.showTooltip()
                } else {
                    RateMe.disable()
                }
            },
            RateMe.reset
        )
    },

    reset: function() {
        const session = window.BG_PAGE.getSession()

        if (session["rating_disabled"]) delete session["rating_disabled"]

        RateMe.open_count = session["open_count"] = 0
        doGetRequest(
            "https://" + DOMAIN + "/Tooltips/resetSeen?name=" + TOOLTIP_NAME
        )
    }
}

//--- Helpers ----------------------------------------------
function doGetRequest(url, callback, errback) {
    const xhr = new XMLHttpRequest()

    xhr.open("GET", url, true)

    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4 && xhr.status == 200) {
            if (callback) callback(xhr)
        } else if (xhr.readyState == 4 && xhr.status == 403) {
            if (errback) errback(xhr)
        }
    }
    xhr.send(null)
}
