/*jslint plusplus: true, vars: true, nomen: true */
/*global $, brackets, define, setTimeout */

define(function (require, exports) {
    "use strict";
    
    var q               = require("../thirdparty/q"),
        AppInit         = brackets.getModule("utils/AppInit"),
        DocumentManager = brackets.getModule("document/DocumentManager"),
        FileSystem      = brackets.getModule("filesystem/FileSystem"),
        ProjectManager  = brackets.getModule("project/ProjectManager"),
        Strings         = require("../strings"),
        ErrorHandler    = require("./ErrorHandler"),
        GitControl      = require("./GitControl"),
        Panel           = require("./Panel"),
        Branch          = require("./Branch");
    
    var $icon                   = $("<a id='git-toolbar-icon' href='#'></a>").attr("title", Strings.LOADING)
                                    .addClass("loading").appendTo($("#main-toolbar .buttons")),
        gitControl              = null,
        preferences             = null,
        // shows detected git version in the status bar
        $gitStatusBar           = $(null),
        // show busy icon in status bar when git operation is running
        $busyIndicator          = $(null),
        busyIndicatorIndex      = 0,
        busyIndicatorInProgress = [];
    
    function showBusyIndicator() {
        var i = busyIndicatorIndex++;
        busyIndicatorInProgress.push(i);
        $busyIndicator.addClass("spin");
        return i;
    }

    function hideBusyIndicator(i) {
        var pos = busyIndicatorInProgress.indexOf(i);
        if (pos !== -1) {
            busyIndicatorInProgress.splice(pos, 1);
        }
        if (busyIndicatorInProgress.length === 0) {
            $busyIndicator.removeClass("spin");
        }
    }

    function getProjectRoot() {
        return ProjectManager.getProjectRoot().fullPath;
    }
    
    // Shows currently installed version or error when Git is not available
    function initGitStatusBar() {
        return gitControl.getVersion().then(function (version) {
            Strings.GIT_VERSION = version;
            $gitStatusBar.text("Git " + version);
        }).fail(function (err) {
            var errText = Strings.CHECK_GIT_SETTINGS + ": " + err.toString();
            $gitStatusBar.addClass("error").text(errText);
            $icon.addClass("error").attr("title", errText);
            throw err;
        });
    }
    
    // This only launches, when bash is available
    function initBashIcon() {
        $("<a id='git-bash'>[ bash ]</a>")
            .appendTo("#project-files-header")
            .on("click", function (e) {
                e.stopPropagation();
                gitControl.bashOpen(getProjectRoot());
            });
    }
    
    // This only launches when Git is available
    function initUi() {
        Panel.init(gitControl, preferences);
        Branch.init(gitControl, preferences);
        
        // Attach events
        $icon.on("click", Panel.toggle);
        
        // Show gitPanel when appropriate
        if (preferences.getValue("panelEnabled")) {
            Panel.toggle(true);
        }
    }
    
    // Call this only when Git is available
    function attachEventsToBrackets() {
        $(ProjectManager).on("projectOpen projectRefresh", function () {
            Branch.refresh();
            Panel.refresh();
        });
        $(FileSystem).on("change rename", function () {
            Branch.refresh();
            Panel.refresh();
        });
        $(DocumentManager).on("documentSaved", function () {
            Panel.refresh();
        });
        $(DocumentManager).on("currentDocumentChange", function () {
            Panel.refreshCurrentFile();
        });
    }
    
    function init(nodeConnection, _preferences) {
        preferences = exports.preferences = _preferences;
        var TIMEOUT_VALUE = preferences.getValue("TIMEOUT_VALUE");
        // Creates an GitControl Instance
        gitControl = exports.gitControl = new GitControl({
            preferences: preferences,
            handler: function (method, cmd, args, opts) {
                var rv = q.defer(),
                    i = showBusyIndicator(),
                    resolved = false;

                opts = opts || {};
                if (opts.cwd) { opts.customCwd = true; }
                else { opts.cwd = getProjectRoot(); }

                if (window.bracketsGit.debug) {
                    console.log("cmd-" + method + ": " + (opts.customCwd ? opts.cwd + "\\" : "") + cmd + " " + args.join(" "));
                }

                // nodeConnection returns jQuery deffered, not Q
                nodeConnection.domains["brackets-git"][method](opts.cwd, cmd, args)
                    .then(function (out) {
                        if (!resolved) {
                            if (window.bracketsGit.debug) { console.log("cmd-" + method + "-out: " + out); }
                            rv.resolve(out);
                        }
                    })
                    .fail(function (err) {
                        if (!resolved) {
                            if (window.bracketsGit.debug) { console.log("cmd-" + method + "-fail: " + err); }
                            rv.reject(err);
                        }
                    })
                    .always(function () {
                        hideBusyIndicator(i);
                        resolved = true;
                    })
                    .done();

                setTimeout(function () {
                    if (!resolved) {
                        var err = new Error("cmd-" + method + "-timeout: " + cmd + " " + args.join(" "));
                        ErrorHandler.logError(err);
                        rv.reject(err);
                        hideBusyIndicator(i);
                        resolved = true;
                    }
                }, opts.timeout || TIMEOUT_VALUE);

                return rv.promise;
            }
        });
        // Initialize items dependent on HTML DOM
        AppInit.htmlReady(function () {
            $icon.removeClass("loading").removeAttr("title");
            $gitStatusBar  = $("<div id='git-status'></div>").appendTo($("#status-indicators"));
            $busyIndicator = $("<div class='spinner'></div>").appendTo($gitStatusBar);
            initGitStatusBar().then(function () {
                initUi();
                attachEventsToBrackets();
            });
            gitControl.bashVersion().then(function () {
                initBashIcon();
            });
        });
    }
    
    // API
    exports.$icon = $icon;
    exports.getProjectRoot = getProjectRoot;
    exports.init = init;
});
