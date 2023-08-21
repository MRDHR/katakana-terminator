// ==UserScript==
// @name        片假名终结者
// @description 在网页中的日语外来语上方标注英文原词
// @author      一生的等待
// @license     MIT
// @copyright   2023, Katakana Terminator Contributors (https://github.com/MRDHR/katakana-terminator/graphs/contributors)
// @namespace   https://github.com/MRDHR
// @homepageURL https://github.com/MRDHR/katakana-terminator
// @supportURL  https://greasyfork.org/zh-CN/scripts/473556-katakana-terminator/feedback
// @icon        https://upload.wikimedia.org/wikipedia/commons/2/28/Ja-Ruby.png
// @require     https://unpkg.com/jquery@3.6.0/dist/jquery.min.js
// @require     https://unpkg.com/sweetalert2@10.16.6/dist/sweetalert2.all.min.js
// @match       *://*/*
// @exclude     *://*.bilibili.com/video/*
// @grant       GM.xmlHttpRequest
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @grant       GM_registerMenuCommand
// @grant       GM_setValue
// @grant       GM_getValue
// @connect     trans.mrdvh.com
// @version     2023.08.21.2
// @name:ja-JP  カタカナターミネーター
// @name:zh-CN  片假名终结者
// @name:en-US  Katakana Terminator
// @description:zh-CN 在网页中的日语外来语上方标注英文原词
// @description:en-US Convert gairaigo (Japanese loan words) back to English
// ==/UserScript==

(function () {
    'use strict';

    // define some shorthands
    var _ = document;

    var queue = {};  // {"カタカナ": [rtNodeA, rtNodeB]}
    var cachedTranslations = {};  // {"ターミネーター": "Terminator"}
    var newNodes = [_.body];

// Recursively traverse the given node and its descendants (Depth-first search)
    function scanTextNodes(node) {
        // The node could have been detached from the DOM tree
        if (!node.parentNode || !_.body.contains(node)) {
            return;
        }

        // Ignore text boxes and echoes
        var excludeTags = {ruby: true, script: true, select: true, textarea: true};

        switch (node.nodeType) {
            case Node.ELEMENT_NODE:
                if (node.tagName.toLowerCase() in excludeTags || node.isContentEditable) {
                    return;
                }
                return node.childNodes.forEach(scanTextNodes);

            case Node.TEXT_NODE:
                while ((node = addRuby(node))) ;
        }
    }

    // Recursively add ruby tags to text nodes
    // Inspired by http://www.the-art-of-web.com/javascript/search-highlight/
    function addRuby(node) {
        var katakana = /[\u30A1-\u30FA\u30FD-\u30FF][\u3099\u309A\u30A1-\u30FF]*[\u3099\u309A\u30A1-\u30FA\u30FC-\u30FF]|[\uFF66-\uFF6F\uFF71-\uFF9D][\uFF65-\uFF9F]*[\uFF66-\uFF9F]/,
            match;
        if (!node.nodeValue || !(match = katakana.exec(node.nodeValue))) {
            return false;
        }
        var ruby = _.createElement('ruby');
        let color = base.getValue('setting_theme_color');
        let transparent = base.getValue('setting_theme_transparent')
        if (color) {
            color = color.replace("#", "")
            if (transparent) {
                color = "#" + color + "00";
            } else {
                color = "#" + color;
            }
            ruby.style.background = color;
        } else {
            ruby.style.background = 'rgba(135, 206, 235, 1)'
        }
        ruby.appendChild(_.createTextNode(match[0]));
        var rt = _.createElement('rt');
        rt.classList.add('katakana-terminator-rt');
        ruby.appendChild(rt);

        // Append the ruby title node to the pending-translation queue
        queue[match[0]] = queue[match[0]] || [];
        queue[match[0]].push(rt);

        // <span>[startカナmiddleテストend]</span> =>
        // <span>start<ruby>カナ<rt data-rt="Kana"></rt></ruby>[middleテストend]</span>
        var after = node.splitText(match.index);
        node.parentNode.insertBefore(ruby, after);
        after.nodeValue = after.nodeValue.substring(match[0].length);
        return after;
    }

// Split word list into chunks to limit the length of API requests
    function translateTextNodes() {
        var apiRequestCount = 0;
        var phraseCount = 0;
        var chunkSize = 200;
        var chunk = [];

        for (var phrase in queue) {
            phraseCount++;
            if (phrase in cachedTranslations) {
                updateRubyByCachedTranslations(phrase);
                continue;
            }

            chunk.push(phrase);
            if (chunk.length >= chunkSize) {
                apiRequestCount++;
                translate(chunk, apiList);
                chunk = [];
            }
        }

        if (chunk.length) {
            apiRequestCount++;
            translate(chunk, apiList);
        }

        if (phraseCount) {
            console.debug('Katakana Terminator:', phraseCount, 'phrases translated in', apiRequestCount, 'requests, frame', window.location.href);
        }
    }

// {"keyA": 1, "keyB": 2} => "?keyA=1&keyB=2"
    function buildQueryString(params) {
        return '?' + Object.keys(params).map(function (k) {
            return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
        }).join('&');
    }

    function translate(phrases) {
        if (!apiList.length) {
            console.error('Katakana Terminator: fallbacks exhausted', phrases);
            phrases.forEach(function (phrase) {
                delete cachedTranslations[phrase];
            });
        }

        // Prevent duplicate HTTP requests before the request completes
        phrases.forEach(function (phrase) {
            cachedTranslations[phrase] = null;
        });

        var api = apiList[0];
        GM_xmlhttpRequest({
            method: "POST",
            headers: {
                "Content-Type": "application/json;charset=utf-8"
            },
            url: 'https://' + api.hosts + api.path,
            data: JSON.stringify(api.params(phrases)),
            responseType: "json",
            onload: function (dom) {
                try {
                    api.callback(phrases, JSON.parse(dom.responseText.replace("'", '\u2019')));
                } catch (err) {
                    console.error('Katakana Terminator: invalid response', err, dom.responseText);
                }
            },
            onerror: function () {
                console.error('Katakana Terminator: request error', api.url);
            },
        });
    }

    var apiList = [
        {
            // https://github.com/Arnie97/katakana-terminator/pull/8
            name: 'Koro Shiro',
            hosts: 'trans.mrdvh.com',
            path: '/convert',
            params: function (phrases) {
                var joinedText = phrases.join('\n').replace(/\s+$/, '');
                return {
                    text: joinedText,
                };
            },
            callback: function (phrases, resp) {
                console.log(resp)
                resp[0].forEach(function (item) {
                    var translated = item[0].replace(/\s+$/, '');
                    var original = item[1].replace(/\s+$/, '');
                    cachedTranslations[original] = translated;
                    updateRubyByCachedTranslations(original);
                });
            },
        }
    ];

// Clear the pending-translation queue
    function updateRubyByCachedTranslations(phrase) {
        if (!cachedTranslations[phrase]) {
            return;
        }
        (queue[phrase] || []).forEach(function (node) {
            node.dataset.rt = cachedTranslations[phrase];
        });
        delete queue[phrase];
    }

// Watch newly added DOM nodes, and save them for later use
    function mutationHandler(mutationList) {
        mutationList.forEach(function (mutationRecord) {
            mutationRecord.addedNodes.forEach(function (node) {
                newNodes.push(node);
            });
        });
    }

    function main() {
        GM_addStyle("rt.katakana-terminator-rt::before { content: attr(data-rt); }");

        var observer = new MutationObserver(mutationHandler);
        observer.observe(_.body, {childList: true, subtree: true});

        function rescanTextNodes() {
            // Deplete buffered mutations
            mutationHandler(observer.takeRecords());
            if (!newNodes.length) {
                return;
            }

            console.debug('Katakana Terminator:', newNodes.length, 'new nodes were added, frame', window.location.href);
            newNodes.forEach(scanTextNodes);
            newNodes.length = 0;
            translateTextNodes();
        }

        // Limit the frequency of API requests
        rescanTextNodes();
        setInterval(rescanTextNodes, 500);
    }

// Polyfill for Greasemonkey 4
    if (typeof GM_xmlhttpRequest === 'undefined' &&
        typeof GM === 'object' && typeof GM.xmlHttpRequest === 'function') {
        GM_xmlhttpRequest = GM.xmlHttpRequest;
    }

    if (typeof GM_addStyle === 'undefined') {
        GM_addStyle = function (css) {
            var head = _.getElementsByTagName('head')[0];
            if (!head) {
                return null;
            }

            var style = _.createElement('style');
            style.setAttribute('type', 'text/css');
            style.textContent = css;
            head.appendChild(style);
            return style;
        };
    }

// Polyfill for ES5
    if (typeof NodeList.prototype.forEach === 'undefined') {
        NodeList.prototype.forEach = function (callback, thisArg) {
            thisArg = thisArg || window;
            for (var i = 0; i < this.length; i++) {
                callback.call(thisArg, this[i], i, this);
            }
        };
    }

    main();

    let color = '';
    let transparent = false;

    const customClass = {
        popup: 'pl-popup',
        header: 'pl-header',
        title: 'pl-title',
        closeButton: 'pl-close',
        content: 'pl-content',
        input: 'pl-input',
        footer: 'pl-footer'
    };

    let toast = Swal.mixin({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 3500,
        timerProgressBar: false,
        didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });

    const message = {
        success: (text) => {
            toast.fire({title: text, icon: 'success'});
        },
        error: (text) => {
            toast.fire({title: text, icon: 'error'});
        },
        warning: (text) => {
            toast.fire({title: text, icon: 'warning'});
        },
        info: (text) => {
            toast.fire({title: text, icon: 'info'});
        },
        question: (text) => {
            toast.fire({title: text, icon: 'question'});
        }
    };

    let base = {
        showSetting() {
            let dom = '';
            dom += `<label class="pl-setting-label"><div class="pl-label">原文背景色</div> <input type="color" id="color" value="${color}"/> <div>`;
            if (transparent) {
                dom += `<input type="checkbox" id="cbTp" name="transparent" checked/><label for="transparent">背景色透明</label></div></label>`;
            } else {
                dom += `<input type="checkbox" id="cbTp" name="transparent" /><label for="transparent">背景色透明</label></div></label>`;
            }
            dom = '<div>' + dom + '</div>';
            Swal.fire({
                title: '配置',
                html: dom,
                icon: 'info',
                showCloseButton: true,
                showConfirmButton: false,
                customClass,
            }).then(() => {
                if (document.getElementById("cbTp").checked) {
                    base.setValue('setting_theme_transparent', true);
                } else {
                    base.setValue('setting_theme_transparent', false);
                }
                base.setValue('setting_theme_color', document.getElementById("color").value);
                message.success('设置成功！即将自动刷新网页');
                setTimeout(new function () {
                    history.go(0);
                }, 3000)
            });
        },
        getValue(name) {
            return GM_getValue(name);
        },

        setValue(name, value) {
            GM_setValue(name, value);
        },

        addStyle(id, tag, css) {
            tag = tag || 'style';
            let doc = document, styleDom = doc.getElementById(id);
            if (styleDom) return;
            let style = doc.createElement(tag);
            style.rel = 'stylesheet';
            style.id = id;
            tag === 'style' ? style.innerHTML = css : style.href = css;
            doc.getElementsByTagName('head')[0].appendChild(style);
        },

        addPanLinkerStyle() {
            color = base.getValue('setting_theme_color');
            transparent = base.getValue('setting_theme_transparent');
            let css = `
            body::-webkit-scrollbar { display: none }
            ::-webkit-scrollbar { width: 6px; height: 10px }
            ::-webkit-scrollbar-track { border-radius: 0; background: none }
            ::-webkit-scrollbar-thumb { background-color: rgba(85,85,85,.4) }
            ::-webkit-scrollbar-thumb,::-webkit-scrollbar-thumb:hover { border-radius: 5px; -webkit-box-shadow: inset 0 0 6px rgba(0,0,0,.2) }
            ::-webkit-scrollbar-thumb:hover { background-color: rgba(85,85,85,.3) }
            .swal2-popup { font-size: 16px !important; }
            .pl-popup { font-size: 12px !important; }
            .pl-popup a { color: ${color} !important; }
            .pl-header { padding: 0!important;align-items: flex-start!important; border-bottom: 1px solid #eee!important; margin: 0 0 10px!important; padding: 0 0 5px!important; }
            .pl-title { font-size: 16px!important; line-height: 1!important;white-space: nowrap!important; text-overflow: ellipsis!important;}
            .pl-content { padding: 0 !important; font-size: 12px!important; }
            .pl-main { max-height: 400px;overflow-y:scroll; }
            .pl-footer {font-size: 12px!important;justify-content: flex-start!important; margin: 10px 0 0!important; padding: 5px 0 0!important; color: #f56c6c!important; }
            .pl-item { display: flex; align-items: center; line-height: 22px; }
            .pl-item-name { flex: 0 0 150px; text-align: left;margin-right: 10px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor:default; }
            .pl-item-link { flex: 1; overflow: hidden; text-align: left; white-space: nowrap; text-overflow: ellipsis;cursor:pointer }
            .pl-item-btn { background: ${color}; padding: 4px 5px; border-radius: 3px; line-height: 1; cursor: pointer; color: #fff; }
            .pl-item-tip { display: flex; justify-content: space-between;flex: 1; }
            .pl-back { width: 70px; background: #ddd; border-radius: 3px; cursor:pointer; margin:1px 0; }
            .pl-ext { display: inline-block; width: 44px; background: #999; color: #fff; height: 16px; line-height: 16px; font-size: 12px; border-radius: 3px;}
            .pl-retry {padding: 3px 10px; background: #cc3235; color: #fff; border-radius: 3px; cursor: pointer;}
            .pl-browserdownload { padding: 3px 10px; background: ${color}; color: #fff; border-radius: 3px; cursor: pointer;}
            .pl-item-progress { display:flex;flex: 1;align-items:center}
            .pl-progress { display: inline-block;vertical-align: middle;width: 100%; box-sizing: border-box;line-height: 1;position: relative;height:15px; flex: 1}
            .pl-progress-outer { height: 15px;border-radius: 100px;background-color: #ebeef5;overflow: hidden;position: relative;vertical-align: middle;}
            .pl-progress-inner{ position: absolute;left: 0;top: 0;background-color: #409eff;text-align: right;border-radius: 100px;line-height: 1;white-space: nowrap;transition: width .6s ease;}
            .pl-progress-inner-text { display: inline-block;vertical-align: middle;color: #d1d1d1;font-size: 12px;margin: 0 5px;height: 15px}
            .pl-progress-tip{ flex:1;text-align:right}
            .pl-progress-how{ flex: 0 0 90px; background: #ddd; border-radius: 3px; margin-left: 10px; cursor: pointer; text-align: center;}
            .pl-progress-stop{ flex: 0 0 50px; padding: 0 10px; background: #cc3235; color: #fff; border-radius: 3px; cursor: pointer;margin-left:10px;height:20px}
            .pl-progress-inner-text:after { display: inline-block;content: "";height: 100%;vertical-align: middle;}
            .pl-btn-primary { background: ${color}; border: 0; border-radius: 4px; color: #ffffff; cursor: pointer; font-size: 12px; outline: none; display:flex; align-items: center; justify-content: center; margin: 2px 0; padding: 6px 0;transition: 0.3s opacity; }
            .pl-btn-primary:hover { opacity: 0.9;transition: 0.3s opacity; }
            .pl-btn-success { background: #55af28; animation: easeOpacity 1.2s 2; animation-fill-mode:forwards }
            .pl-btn-info { background: #606266; }
            .pl-btn-warning { background: #da9328; }
            .pl-btn-warning { background: #da9328; }
            .pl-btn-danger { background: #cc3235; }
            .ali-button {display: inline-flex;align-items: center;justify-content: center;border: 0 solid transparent;border-radius: 5px;box-shadow: 0 0 0 0 transparent;width: fit-content;white-space: nowrap;flex-shrink: 0;font-size: 14px;line-height: 1.5;outline: 0;touch-action: manipulation;transition: background .3s ease,color .3s ease,border .3s ease,box-shadow .3s ease;color: #fff;background: rgb(99 125 255);margin-left: 20px;padding: 1px 12px;position: relative; cursor:pointer; height: 32px;}
            .ali-button:hover {background: rgb(122, 144, 255)}
            .tianyi-button {margin-right: 20px; padding: 4px 12px; border-radius: 4px; color: #fff; font-size: 12px; border: 1px solid #0073e3; background: #2b89ea; cursor: pointer; position: relative;}
            .tianyi-button:hover {border-color: #1874d3; background: #3699ff;}
            .yidong-button {float: left; position: relative; margin: 20px 24px 20px 0; width: 98px; height: 36px; background: #3181f9; border-radius: 2px; font-size: 14px; color: #fff; line-height: 39px; text-align: center; cursor: pointer;}
            .yidong-share-button {display: inline-block; position: relative; font-size: 14px; line-height: 36px; text-align: center; color: #fff; border: 1px solid #5a9afa; border-radius: 2px; padding: 0 24px; margin-left: 24px; background: #3181f9;}
            .yidong-button:hover {background: #2d76e5;}
            .xunlei-button {display: inline-flex;align-items: center;justify-content: center;border: 0 solid transparent;border-radius: 5px;box-shadow: 0 0 0 0 transparent;width: fit-content;white-space: nowrap;flex-shrink: 0;font-size: 14px;line-height: 1.5;outline: 0;touch-action: manipulation;transition: background .3s ease,color .3s ease,border .3s ease,box-shadow .3s ease;color: #fff;background: #3f85ff;margin-left: 12px;padding: 0px 12px;position: relative; cursor:pointer; height: 36px;}
            .xunlei-button:hover {background: #619bff}
            .quark-button {display: inline-flex; align-items: center; justify-content: center; border: 1px solid #ddd; border-radius: 8px; white-space: nowrap; flex-shrink: 0; font-size: 14px; line-height: 1.5; outline: 0; color: #333; background: #fff; margin-right: 10px; padding: 0px 14px; position: relative; cursor: pointer; height: 36px;}
            .quark-button:hover { background:#f6f6f6 }
            .pl-dropdown-menu {position: absolute;right: 0;top: 30px;padding: 5px 0;color: rgb(37, 38, 43);background: #fff;z-index: 999;width: 102px;border: 1px solid #ddd;border-radius: 10px; box-shadow: 0 0 1px 1px rgb(28 28 32 / 5%), 0 8px 24px rgb(28 28 32 / 12%);}
            .pl-dropdown-menu-item { height: 30px;display: flex;align-items: center;justify-content: center;cursor:pointer }
            .pl-dropdown-menu-item:hover { background-color: rgba(132,133,141,0.08);}
            .pl-button .pl-dropdown-menu { display: none; }
            .pl-button:hover .pl-dropdown-menu { display: block!important; }
            .pl-button-init { opacity: 0.5; animation: easeInitOpacity 1.2s 3; animation-fill-mode:forwards }
             @keyframes easeInitOpacity { from { opacity: 0.5; } 50% { opacity: 1 } to { opacity: 0.5; } }
             @keyframes easeOpacity { from { opacity: 1; } 50% { opacity: 0.35 } to { opacity: 1; } }
            .element-clicked { opacity: 0.5; }
            .pl-extra { margin-top: 10px;display:flex}
            .pl-extra button { flex: 1}
            .pointer { cursor:pointer }
            .pl-setting-label { display: flex;align-items: center;justify-content: space-between;padding-top: 10px; }
            .pl-label { flex: 0 0 100px;text-align:center; }
            .pl-input { flex: 1; padding: 8px 10px; border: 1px solid #c2c2c2; border-radius: 5px; font-size: 14px }
            .pl-color { flex: 1;display: flex;flex-wrap: wrap; margin-right: -10px;}
            .pl-color-box { width: 35px;height: 35px;margin:10px 10px 0 0;; box-sizing: border-box;border:1px solid #fff;cursor:pointer }
            .pl-color-box.checked { border:3px dashed #111!important }
            .pl-close:focus { outline: 0; box-shadow: none; }
            .tag-danger {color:#cc3235;margin: 0 5px;}
            .pl-tooltip { position: absolute; color: #ffffff; max-width: 600px; font-size: 12px; padding: 5px 10px; background: #333; border-radius: 5px; z-index: 110000; line-height: 1.3; display:none; word-break: break-all;}
             @keyframes load { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
            .pl-loading-box > div > div { position: absolute;border-radius: 50%;}
            .pl-loading-box > div > div:nth-child(1) { top: 9px;left: 9px;width: 82px;height: 82px;background: #ffffff;}
            .pl-loading-box > div > div:nth-child(2) { top: 14px;left: 38px;width: 25px;height: 25px;background: #666666;animation: load 1s linear infinite;transform-origin: 12px 36px;}
            .pl-loading { width: 16px;height: 16px;display: inline-block;overflow: hidden;background: none;}
            .pl-loading-box { width: 100%;height: 100%;position: relative;transform: translateZ(0) scale(0.16);backface-visibility: hidden;transform-origin: 0 0;}
            .pl-loading-box div { box-sizing: content-box; }
            .swal2-container { z-index:100000!important; }
            body.swal2-height-auto { height: inherit!important; }
            .btn-operate .btn-main { display:flex; align-items:center; }
            `;
            this.addStyle('panlinker-style', 'style', css);
        },

        initDefaultConfig() {
            let value = [{
                name: 'setting_theme_color',
                value: '#09AAFF'
            }, {
                name: 'setting_theme_transparent',
                value: false
            }];

            value.forEach((v) => {
                base.getValue(v.name) === undefined && base.setValue(v.name, v.value);
            });
        },
        registerMenuCommand() {
            GM_registerMenuCommand('⚙️ 设置', () => {
                this.showSetting();
            });
        },
    }
    base.initDefaultConfig();
    base.addPanLinkerStyle();
    base.registerMenuCommand();
})();