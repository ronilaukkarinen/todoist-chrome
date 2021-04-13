const DOMAIN = "chrome.todoist.com"
const EXT_DOMAIN = "ext.todoist.com"
const QUICK_ADD_WIDTH = 550
const QUICK_ADD_HEIGHT = 380
const QUICK_ADD_URL = "https://todoist.com/add?"

const TIMEOUT_1_MIN = 15 * 60 * 1000

let TIMEOUT_WS_CONNECT = null
let WS_SOCKET = null
let USER_TOKEN = null

/*
 * For fetching the current location and title
 */
let CURRENT_LOCATION = {
    location: "",
    title: ""
}

function getCurrentLocationAndTitle() {
    return CURRENT_LOCATION
}

setInterval(function () {
    chrome.tabs.getSelected(null, function (tab) {
        if (tab) {
            CURRENT_LOCATION.location = tab.url
            CURRENT_LOCATION.title = tab.title
        }
    })
}, 200)

/*
 * For remebering the last viewed iframe URL
 */
let FRAME_SRC = null
function setFrameLocation(url) {
    if (url) {
        FRAME_SRC = url
        if (window.localStorage) localStorage["frame_src"] = url
    }
}

function getFrameLocation() {
    let saved = null

    if (window.localStorage) saved = window.localStorage["frame_src"]

    if (saved) return saved
    else return FRAME_SRC
}

function getSession() {
    return window.localStorage
}

/*
 * For updating task count badge and logging in/out
 */
function updateBadge(total_count, is_overdue) {
    if (total_count == 0) {
        chrome.browserAction.setBadgeText({ text: "" })
    } else {
        chrome.browserAction.setBadgeText({ text: "" + total_count })
        chrome.browserAction.setBadgeBackgroundColor({ color: [228, 66, 50, 255] })
    }
}

chrome.extension.onRequest.addListener(function (
    request,
    sender,
    sendResponse
) {
    if (!request.type) {
        return
    }

    if (request.type == "init_ws_updates") {
        if (!WS_SOCKET) {
            bindToWSUpdates()
            checkTodoistCounts()
        }
    } else if (request.type == "reset_ws_updates") {
        updateBadge(0, false)
        if (WS_SOCKET) {
            WS_SOCKET.close()
            WS_SOCKET = null
        }
    }
})

// --- Update counts
function checkTodoistCounts() {
    const xhr = new XMLHttpRequest()

    xhr.open("GET", "https://" + EXT_DOMAIN + "/Agenda/getCount", true)

    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4 && xhr.status == 200) {
            try {
                const counts = window.JSON.parse(xhr.responseText)
                updateBadge(counts.today + counts.overdue, counts.overdue > 0)
            } catch (e) {}
        }
    }

    xhr.send(null)
}

// --- Bind to web-socket updates
function bindToWSUpdates() {
    const xhr = new XMLHttpRequest()

    xhr.open("GET", "https://" + DOMAIN + "/API/v8/get_session_user", true)

    xhr.onreadystatechange = function () {
        if (xhr.readyState == 4 && xhr.status == 200) {
            try {
                const user = window.JSON.parse(xhr.responseText)

                USER_TOKEN = user.token

                WS_SOCKET = new WebSocket(user.websocket_url)

                WS_SOCKET.addEventListener("message", function () {
                    const data = JSON.parse(event.data)

                    if (data.type == "agenda_updated") {
                        checkTodoistCounts()
                    } else if (data.type == "token_reset") {
                        WS_SOCKET = null
                        bindToWSUpdates()
                    }
                })

                WS_SOCKET.addEventListener("close", function () {
                    _setBindToWSUpdatesTimeout(TIMEOUT_1_MIN)
                    WS_SOCKET = null
                })
            } catch (e) {}
        }
    }

    xhr.send(null)
}

function _setBindToWSUpdatesTimeout(timeout) {
    if (TIMEOUT_WS_CONNECT) clearTimeout(TIMEOUT_WS_CONNECT)
    TIMEOUT_WS_CONNECT = setTimeout(bindToWSUpdates, timeout)
}

/*
 * Initial
 */
bindToWSUpdates()
checkTodoistCounts()

/*
 * Option management
 */

const ExtensionOptions = {
    withDueToday: false
}

function readOptionFromStorage() {
    chrome.storage.sync.get(["withDueToday"], function (items) {
        ExtensionOptions.withDueToday = items.withDueToday
    })
}

chrome.storage.onChanged.addListener(readOptionFromStorage)
readOptionFromStorage()

function pad(num) {
    if (num < 10) {
        return "0" + num
    }
    return num
}

/*
 * iso date string format YYYY-MM-DD
 */
function isoDateOnly(date) {
    return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate())
    )
}

/*
 * Context menu adding
 */
function getQuickAddPosition(win) {
    if (win) {
        const top = win.height / 2 - QUICK_ADD_HEIGHT / 2 + win.top
        const left = win.width / 2 - QUICK_ADD_WIDTH / 2 + win.left
        return [top, left]
    } else {
        const top = screen.height / 2 - height / 2
        const left = screen.width / 2 - width / 2
        return [top, left]
    }
}

function showTodoistQuickAdd(content, top, left) {
    let urlParms = `content=${encodeURIComponent(content)}&view_mode=window`
    if (ExtensionOptions.withDueToday) {
        urlParms += "&date=today"
    }
    chrome.windows.create({
        url: QUICK_ADD_URL + urlParms,
        type: "popup",
        width: QUICK_ADD_WIDTH,
        height: QUICK_ADD_HEIGHT,
        top: Math.round(top),
        left: Math.round(left),
        setSelfAsOpener: true
    })
}

function addTabAsTask(tab) {
    chrome.windows.getCurrent(function (win) {
        // We need to normalize the title to prevent malformed Markdown
        const title = tab.title.replace(/\[/g, "(").replace(/\]/g, ")")
        content = `[${title}](${tab.url})`

        const [top, left] = getQuickAddPosition(win)
        showTodoistQuickAdd(content, top, left)
    })
}

function addToTodoistFromMenu(ev, tab) {
    addTabAsTask(tab)
}

chrome.contextMenus.create({
    title: chrome.i18n.getMessage("addToTodoist"),
    contexts: ["page", "selection", "link"]
})
chrome.contextMenus.onClicked.addListener(addToTodoistFromMenu)

function addToTodoistCommand() {
    chrome.tabs.query(
        {
            active: true,
            lastFocusedWindow: true
        },
        function (tabs) {
            if (tabs.length > 0) {
                const tab = tabs[0]
                addToTodoistFromMenu({ pageUrl: tab.url }, tab)
            } else {
                const [top, left] = getQuickAddPosition()
                showTodoistQuickAdd("", top, left)
            }
        }
    )
}

chrome.commands.onCommand.addListener(function (command) {
    switch (command) {
        case "add-to-todoist":
            addToTodoistCommand()
            break
        default:
            console.warn("Unrecognized command:", command)
    }
})
