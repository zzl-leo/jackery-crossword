var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    let src_url_equal_anchor;
    function src_url_equal(element_src, url) {
        if (!src_url_equal_anchor) {
            src_url_equal_anchor = document.createElement('a');
        }
        src_url_equal_anchor.href = url;
        return element_src === src_url_equal_anchor.href;
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function get_all_dirty_from_scope($$scope) {
        if ($$scope.ctx.length > 32) {
            const dirty = [];
            const length = $$scope.ctx.length / 32;
            for (let i = 0; i < length; i++) {
                dirty[i] = -1;
            }
            return dirty;
        }
        return -1;
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    // Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
    // at the end of hydration without touching the remaining nodes.
    let is_hydrating = false;
    function start_hydrating() {
        is_hydrating = true;
    }
    function end_hydrating() {
        is_hydrating = false;
    }
    function upper_bound(low, high, key, value) {
        // Return first index of value larger than input value in the range [low, high)
        while (low < high) {
            const mid = low + ((high - low) >> 1);
            if (key(mid) <= value) {
                low = mid + 1;
            }
            else {
                high = mid;
            }
        }
        return low;
    }
    function init_hydrate(target) {
        if (target.hydrate_init)
            return;
        target.hydrate_init = true;
        // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
        let children = target.childNodes;
        // If target is <head>, there may be children without claim_order
        if (target.nodeName === 'HEAD') {
            const myChildren = [];
            for (let i = 0; i < children.length; i++) {
                const node = children[i];
                if (node.claim_order !== undefined) {
                    myChildren.push(node);
                }
            }
            children = myChildren;
        }
        /*
        * Reorder claimed children optimally.
        * We can reorder claimed children optimally by finding the longest subsequence of
        * nodes that are already claimed in order and only moving the rest. The longest
        * subsequence of nodes that are claimed in order can be found by
        * computing the longest increasing subsequence of .claim_order values.
        *
        * This algorithm is optimal in generating the least amount of reorder operations
        * possible.
        *
        * Proof:
        * We know that, given a set of reordering operations, the nodes that do not move
        * always form an increasing subsequence, since they do not move among each other
        * meaning that they must be already ordered among each other. Thus, the maximal
        * set of nodes that do not move form a longest increasing subsequence.
        */
        // Compute longest increasing subsequence
        // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
        const m = new Int32Array(children.length + 1);
        // Predecessor indices + 1
        const p = new Int32Array(children.length);
        m[0] = -1;
        let longest = 0;
        for (let i = 0; i < children.length; i++) {
            const current = children[i].claim_order;
            // Find the largest subsequence length such that it ends in a value less than our current value
            // upper_bound returns first greater value, so we subtract one
            // with fast path for when we are on the current longest subsequence
            const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
            p[i] = m[seqLen] + 1;
            const newLen = seqLen + 1;
            // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
            m[newLen] = i;
            longest = Math.max(newLen, longest);
        }
        // The longest increasing subsequence of nodes (initially reversed)
        const lis = [];
        // The rest of the nodes, nodes that will be moved
        const toMove = [];
        let last = children.length - 1;
        for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
            lis.push(children[cur - 1]);
            for (; last >= cur; last--) {
                toMove.push(children[last]);
            }
            last--;
        }
        for (; last >= 0; last--) {
            toMove.push(children[last]);
        }
        lis.reverse();
        // We sort the nodes being moved to guarantee that their insertion order matches the claim order
        toMove.sort((a, b) => a.claim_order - b.claim_order);
        // Finally, we move the nodes
        for (let i = 0, j = 0; i < toMove.length; i++) {
            while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
                j++;
            }
            const anchor = j < lis.length ? lis[j] : null;
            target.insertBefore(toMove[i], anchor);
        }
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function get_root_for_style(node) {
        if (!node)
            return document;
        const root = node.getRootNode ? node.getRootNode() : node.ownerDocument;
        if (root && root.host) {
            return root;
        }
        return node.ownerDocument;
    }
    function append_empty_stylesheet(node) {
        const style_element = element('style');
        append_stylesheet(get_root_for_style(node), style_element);
        return style_element.sheet;
    }
    function append_stylesheet(node, style) {
        append(node.head || node, style);
        return style.sheet;
    }
    function append_hydration(target, node) {
        if (is_hydrating) {
            init_hydrate(target);
            if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
                target.actual_end_child = target.firstChild;
            }
            // Skip nodes of undefined ordering
            while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
                target.actual_end_child = target.actual_end_child.nextSibling;
            }
            if (node !== target.actual_end_child) {
                // We only insert if the ordering of this node should be modified or the parent node is not target
                if (node.claim_order !== undefined || node.parentNode !== target) {
                    target.insertBefore(node, target.actual_end_child);
                }
            }
            else {
                target.actual_end_child = node.nextSibling;
            }
        }
        else if (node.parentNode !== target || node.nextSibling !== null) {
            target.appendChild(node);
        }
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function insert_hydration(target, node, anchor) {
        if (is_hydrating && !anchor) {
            append_hydration(target, node);
        }
        else if (node.parentNode !== target || node.nextSibling != anchor) {
            target.insertBefore(node, anchor || null);
        }
    }
    function detach(node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function init_claim_info(nodes) {
        if (nodes.claim_info === undefined) {
            nodes.claim_info = { last_index: 0, total_claimed: 0 };
        }
    }
    function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
        // Try to find nodes in an order such that we lengthen the longest increasing subsequence
        init_claim_info(nodes);
        const resultNode = (() => {
            // We first try to find an element after the previous one
            for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
                const node = nodes[i];
                if (predicate(node)) {
                    const replacement = processNode(node);
                    if (replacement === undefined) {
                        nodes.splice(i, 1);
                    }
                    else {
                        nodes[i] = replacement;
                    }
                    if (!dontUpdateLastIndex) {
                        nodes.claim_info.last_index = i;
                    }
                    return node;
                }
            }
            // Otherwise, we try to find one before
            // We iterate in reverse so that we don't go too far back
            for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
                const node = nodes[i];
                if (predicate(node)) {
                    const replacement = processNode(node);
                    if (replacement === undefined) {
                        nodes.splice(i, 1);
                    }
                    else {
                        nodes[i] = replacement;
                    }
                    if (!dontUpdateLastIndex) {
                        nodes.claim_info.last_index = i;
                    }
                    else if (replacement === undefined) {
                        // Since we spliced before the last_index, we decrease it
                        nodes.claim_info.last_index--;
                    }
                    return node;
                }
            }
            // If we can't find any matching node, we create a new one
            return createNode();
        })();
        resultNode.claim_order = nodes.claim_info.total_claimed;
        nodes.claim_info.total_claimed += 1;
        return resultNode;
    }
    function claim_element_base(nodes, name, attributes, create_element) {
        return claim_node(nodes, (node) => node.nodeName === name, (node) => {
            const remove = [];
            for (let j = 0; j < node.attributes.length; j++) {
                const attribute = node.attributes[j];
                if (!attributes[attribute.name]) {
                    remove.push(attribute.name);
                }
            }
            remove.forEach(v => node.removeAttribute(v));
            return undefined;
        }, () => create_element(name));
    }
    function claim_element(nodes, name, attributes) {
        return claim_element_base(nodes, name, attributes, element);
    }
    function claim_svg_element(nodes, name, attributes) {
        return claim_element_base(nodes, name, attributes, svg_element);
    }
    function claim_text(nodes, data) {
        return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
            const dataStr = '' + data;
            if (node.data.startsWith(dataStr)) {
                if (node.data.length !== dataStr.length) {
                    return node.splitText(dataStr.length);
                }
            }
            else {
                node.data = dataStr;
            }
        }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
        );
    }
    function claim_space(nodes) {
        return claim_text(nodes, ' ');
    }
    function find_comment(nodes, text, start) {
        for (let i = start; i < nodes.length; i += 1) {
            const node = nodes[i];
            if (node.nodeType === 8 /* comment node */ && node.textContent.trim() === text) {
                return i;
            }
        }
        return nodes.length;
    }
    function claim_html_tag(nodes, is_svg) {
        // find html opening tag
        const start_index = find_comment(nodes, 'HTML_TAG_START', 0);
        const end_index = find_comment(nodes, 'HTML_TAG_END', start_index);
        if (start_index === end_index) {
            return new HtmlTagHydration(undefined, is_svg);
        }
        init_claim_info(nodes);
        const html_tag_nodes = nodes.splice(start_index, end_index - start_index + 1);
        detach(html_tag_nodes[0]);
        detach(html_tag_nodes[html_tag_nodes.length - 1]);
        const claimed_nodes = html_tag_nodes.slice(1, html_tag_nodes.length - 1);
        for (const n of claimed_nodes) {
            n.claim_order = nodes.claim_info.total_claimed;
            nodes.claim_info.total_claimed += 1;
        }
        return new HtmlTagHydration(claimed_nodes, is_svg);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        text.data = data;
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function set_style(node, key, value, important) {
        if (value == null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    // unfortunately this can't be a constant as that wouldn't be tree-shakeable
    // so we cache the result instead
    let crossorigin;
    function is_crossorigin() {
        if (crossorigin === undefined) {
            crossorigin = false;
            try {
                if (typeof window !== 'undefined' && window.parent) {
                    void window.parent.document;
                }
            }
            catch (error) {
                crossorigin = true;
            }
        }
        return crossorigin;
    }
    function add_iframe_resize_listener(node, fn) {
        const computed_style = getComputedStyle(node);
        if (computed_style.position === 'static') {
            node.style.position = 'relative';
        }
        const iframe = element('iframe');
        iframe.setAttribute('style', 'display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ' +
            'overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: -1;');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        const crossorigin = is_crossorigin();
        let unsubscribe;
        if (crossorigin) {
            iframe.src = "data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>";
            unsubscribe = listen(window, 'message', (event) => {
                if (event.source === iframe.contentWindow)
                    fn();
            });
        }
        else {
            iframe.src = 'about:blank';
            iframe.onload = () => {
                unsubscribe = listen(iframe.contentWindow, 'resize', fn);
                // make sure an initial resize event is fired _after_ the iframe is loaded (which is asynchronous)
                // see https://github.com/sveltejs/svelte/issues/4233
                fn();
            };
        }
        append(node, iframe);
        return () => {
            if (crossorigin) {
                unsubscribe();
            }
            else if (unsubscribe && iframe.contentWindow) {
                unsubscribe();
            }
            detach(iframe);
        };
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }
    class HtmlTag {
        constructor(is_svg = false) {
            this.is_svg = false;
            this.is_svg = is_svg;
            this.e = this.n = null;
        }
        c(html) {
            this.h(html);
        }
        m(html, target, anchor = null) {
            if (!this.e) {
                if (this.is_svg)
                    this.e = svg_element(target.nodeName);
                /** #7364  target for <template> may be provided as #document-fragment(11) */
                else
                    this.e = element((target.nodeType === 11 ? 'TEMPLATE' : target.nodeName));
                this.t = target.tagName !== 'TEMPLATE' ? target : target.content;
                this.c(html);
            }
            this.i(anchor);
        }
        h(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.nodeName === 'TEMPLATE' ? this.e.content.childNodes : this.e.childNodes);
        }
        i(anchor) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(this.t, this.n[i], anchor);
            }
        }
        p(html) {
            this.d();
            this.h(html);
            this.i(this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }
    class HtmlTagHydration extends HtmlTag {
        constructor(claimed_nodes, is_svg = false) {
            super(is_svg);
            this.e = this.n = null;
            this.l = claimed_nodes;
        }
        c(html) {
            if (this.l) {
                this.n = this.l;
            }
            else {
                super.c(html);
            }
        }
        i(anchor) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert_hydration(this.t, this.n[i], anchor);
            }
        }
    }

    // we need to store the information for multiple documents because a Svelte application could also contain iframes
    // https://github.com/sveltejs/svelte/issues/3624
    const managed_styles = new Map();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_style_information(doc, node) {
        const info = { stylesheet: append_empty_stylesheet(node), rules: {} };
        managed_styles.set(doc, info);
        return info;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = get_root_for_style(node);
        const { stylesheet, rules } = managed_styles.get(doc) || create_style_information(doc, node);
        if (!rules[name]) {
            rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ''}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            managed_styles.forEach(info => {
                const { ownerNode } = info.stylesheet;
                // there is no ownerNode if it runs on jsdom.
                if (ownerNode)
                    detach(ownerNode);
            });
            managed_styles.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    /**
     * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
     * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
     * it can be called from an external module).
     *
     * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
     *
     * https://svelte.dev/docs#run-time-svelte-onmount
     */
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    /**
     * Creates an event dispatcher that can be used to dispatch [component events](/docs#template-syntax-component-directives-on-eventname).
     * Event dispatchers are functions that can take two arguments: `name` and `detail`.
     *
     * Component events created with `createEventDispatcher` create a
     * [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
     * These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
     * The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
     * property and can contain any type of data.
     *
     * https://svelte.dev/docs#run-time-svelte-createeventdispatcher
     */
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail, { cancelable = false } = {}) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail, { cancelable });
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
                return !event.defaultPrevented;
            }
            return true;
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    let render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = /* @__PURE__ */ Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        // Do not reenter flush while dirty components are updated, as this can
        // result in an infinite loop. Instead, let the inner flush handle it.
        // Reentrancy is ok afterwards for bindings etc.
        if (flushidx !== 0) {
            return;
        }
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            try {
                while (flushidx < dirty_components.length) {
                    const component = dirty_components[flushidx];
                    flushidx++;
                    set_current_component(component);
                    update(component.$$);
                }
            }
            catch (e) {
                // reset dirty state to not end up in a deadlocked state and then rethrow
                dirty_components.length = 0;
                flushidx = 0;
                throw e;
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    /**
     * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
     */
    function flush_render_callbacks(fns) {
        const filtered = [];
        const targets = [];
        render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
        targets.forEach((c) => c());
        render_callbacks = filtered;
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        const options = { direction: 'both' };
        let config = fn(node, params, options);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = (program.b - t);
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program || pending_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config(options);
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function claim_component(block, parent_nodes) {
        block && block.l(parent_nodes);
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
                // if the component was destroyed immediately
                // it will update the `$$.on_destroy` reference to `null`.
                // the destructured on_destroy may still reference to the old array
                if (component.$$.on_destroy) {
                    component.$$.on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            flush_render_callbacks($$.after_update);
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: [],
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                start_hydrating();
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            end_hydrating();
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            if (!is_function(callback)) {
                return noop;
            }
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Toolbar.svelte generated by Svelte v3.59.2 */

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[6] = list[i];
    	return child_ctx;
    }

    // (16:33) 
    function create_if_block_2$2(ctx) {
    	let button;
    	let t;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			t = text(/*btn_check*/ ctx[2]);
    			this.h();
    		},
    		l(nodes) {
    			button = claim_element(nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);
    			t = claim_text(button_nodes, /*btn_check*/ ctx[2]);
    			button_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(button, "class", "svelte-1awe1n5");
    		},
    		m(target, anchor) {
    			insert_hydration(target, button, anchor);
    			append_hydration(button, t);

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler_1*/ ctx[5]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*btn_check*/ 4) set_data(t, /*btn_check*/ ctx[2]);
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (14:34) 
    function create_if_block_1$3(ctx) {
    	return {
    		c: noop,
    		l: noop,
    		m: noop,
    		p: noop,
    		d: noop
    	};
    }

    // (12:4) {#if action === 'clear'}
    function create_if_block$5(ctx) {
    	let button;
    	let t;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			button = element("button");
    			t = text(/*btn_reset*/ ctx[1]);
    			this.h();
    		},
    		l(nodes) {
    			button = claim_element(nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);
    			t = claim_text(button_nodes, /*btn_reset*/ ctx[1]);
    			button_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(button, "class", "svelte-1awe1n5");
    		},
    		m(target, anchor) {
    			insert_hydration(target, button, anchor);
    			append_hydration(button, t);

    			if (!mounted) {
    				dispose = listen(button, "click", /*click_handler*/ ctx[4]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*btn_reset*/ 2) set_data(t, /*btn_reset*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (11:2) {#each actions as action}
    function create_each_block$5(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*action*/ ctx[6] === 'clear') return create_if_block$5;
    		if (/*action*/ ctx[6] === 'reveal') return create_if_block_1$3;
    		if (/*action*/ ctx[6] === 'check') return create_if_block_2$2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if (if_block) if_block.d(1);
    				if_block = current_block_type && current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		d(detaching) {
    			if (if_block) {
    				if_block.d(detaching);
    			}

    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function create_fragment$b(ctx) {
    	let div;
    	let each_value = /*actions*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div_nodes);
    			}

    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "toolbar svelte-1awe1n5");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div, null);
    				}
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*dispatch, btn_reset, actions, btn_check*/ 15) {
    				each_value = /*actions*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$5(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$5(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$b($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { actions = ["clear", "reveal", "check"] } = $$props;
    	let { btn_reset = "REST" } = $$props;
    	let { btn_check = "CHECK" } = $$props;
    	const click_handler = () => dispatch('event', 'clear');
    	const click_handler_1 = () => dispatch('event', 'check');

    	$$self.$$set = $$props => {
    		if ('actions' in $$props) $$invalidate(0, actions = $$props.actions);
    		if ('btn_reset' in $$props) $$invalidate(1, btn_reset = $$props.btn_reset);
    		if ('btn_check' in $$props) $$invalidate(2, btn_check = $$props.btn_check);
    	};

    	return [actions, btn_reset, btn_check, dispatch, click_handler, click_handler_1];
    }

    class Toolbar extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { actions: 0, btn_reset: 1, btn_check: 2 });
    	}
    }

    var standard = [{
    	"row": 0,
    	"value": "q"
    }, {
    	"row": 0,
    	"value": "w"
    }, {
    	"row": 0,
    	"value": "e"
    }, {
    	"row": 0,
    	"value": "r"
    }, {
    	"row": 0,
    	"value": "t"
    }, {
    	"row": 0,
    	"value": "y"
    }, {
    	"row": 0,
    	"value": "u"
    },  {
    	"row": 0,
    	"value": "i"
    },  {
    	"row": 0,
    	"value": "o"
    },  {
    	"row": 0,
    	"value": "p"
    }, {
    	"row": 1,
    	"value": "a"
    }, {
    	"row": 1,
    	"value": "s"
    }, {
    	"row": 1,
    	"value": "d"
    }, {
    	"row": 1,
    	"value": "f"
    }, {
    	"row": 1,
    	"value": "g"
    }, {
    	"row": 1,
    	"value": "h"
    }, {
    	"row": 1,
    	"value": "j"
    }, {
    	"row": 1,
    	"value": "k"
    }, {
    	"row": 1,
    	"value": "l"
    }, {
    	"row": 2,
    	"value": "Shift",
    }, {
    	"row": 2,
    	"value": "z"
    }, {
    	"row": 2,
    	"value": "x"
    }, {
    	"row": 2,
    	"value": "c"
    }, {
    	"row": 2,
    	"value": "v"
    }, {
    	"row": 2,
    	"value": "b"
    }, {
    	"row": 2,
    	"value": "n"
    }, {
    	"row": 2,
    	"value": "m"
    }, {
    	"row": 2,
    	"value": "Backspace"
    }, {
    	"row": 3,
    	"value": "Page1",
    },  {
    	"row": 3,
    	"value": ",",
    },  {
    	"row": 3,
    	"value": "Space",
    },  {
    	"row": 3,
    	"value": ".",
    },  {
    	"row": 3,
    	"value": "Enter",
    }, {
    	"row": 0,
    	"value": "1",
    	"page": 1
    }, {
    	"row": 0,
    	"value": "2",
    	"page": 1
    }, {
    	"row": 0,
    	"value": "3",
    	"page": 1
    }, {
    	"row": 0,
    	"value": "4",
    	"page": 1
    }, {
    	"row": 0,
    	"value": "5",
    	"page": 1
    }, {
    	"row": 0,
    	"value": "6",
    	"page": 1
    }, {
    	"row": 0,
    	"value": "7",
    	"page": 1
    }, {
    	"row": 0,
    	"value": "8",
    	"page": 1
    }, {
    	"row": 0,
    	"value": "9",
    	"page": 1
    }, {
    	"row": 0,
    	"value": "0",
    	"page": 1
    }, {
    	"row": 1,
    	"value": "!",
    	"page": 1
    }, {
    	"row": 1,
    	"value": "@",
    	"page": 1
    }, {
    	"row": 1,
    	"value": "#",
    	"page": 1
    }, {
    	"row": 1,
    	"value": "$",
    	"page": 1
    }, {
    	"row": 1,
    	"value": "%",
    	"page": 1
    }, {
    	"row": 1,
    	"value": "^",
    	"page": 1
    }, {
    	"row": 1,
    	"value": "&",
    	"page": 1
    }, {
    	"row": 1,
    	"value": "*",
    	"page": 1
    }, {
    	"row": 1,
    	"value": "(",
    	"page": 1
    }, {
    	"row": 1,
    	"value": ")",
    	"page": 1
    }, {
    	"row": 2,
    	"value": "-",
    	"page": 1
    }, {
    	"row": 2,
    	"value": "_",
    	"page": 1
    }, {
    	"row": 2,
    	"value": "=",
    	"page": 1
    }, {
    	"row": 2,
    	"value": "+",
    	"page": 1
    }, {
    	"row": 2,
    	"value": ";",
    	"page": 1
    }, {
    	"row": 2,
    	"value": ":",
    	"page": 1
    }, {
    	"row": 2,
    	"value": "'",
    	"page": 1
    }, {
    	"row": 2,
    	"value": "\"",
    	"page": 1
    }, {
    	"row": 2,
    	"value": "<",
    	"page": 1
    }, {
    	"row": 2,
    	"value": ">",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "Page0",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "/",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "?",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "[",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "]",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "{",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "}",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "|",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "\\",
    	"page": 1
    }, {
    	"row": 3,
    	"value": "~",
    	"page": 1
    }];

    var crossword = [{
    	"row": 0,
    	"value": "Q"
    }, {
    	"row": 0,
    	"value": "W"
    }, {
    	"row": 0,
    	"value": "E"
    }, {
    	"row": 0,
    	"value": "R"
    }, {
    	"row": 0,
    	"value": "T"
    }, {
    	"row": 0,
    	"value": "Y"
    }, {
    	"row": 0,
    	"value": "U"
    },  {
    	"row": 0,
    	"value": "I"
    },  {
    	"row": 0,
    	"value": "O"
    },  {
    	"row": 0,
    	"value": "P"
    }, {
    	"row": 1,
    	"value": "A"
    }, {
    	"row": 1,
    	"value": "S"
    }, {
    	"row": 1,
    	"value": "D"
    }, {
    	"row": 1,
    	"value": "F"
    }, {
    	"row": 1,
    	"value": "G"
    }, {
    	"row": 1,
    	"value": "H"
    }, {
    	"row": 1,
    	"value": "J"
    }, {
    	"row": 1,
    	"value": "K"
    }, {
    	"row": 1,
    	"value": "L"
    }, {
    	"row": 2,
    	"value": "Z"
    }, {
    	"row": 2,
    	"value": "X"
    }, {
    	"row": 2,
    	"value": "C"
    }, {
    	"row": 2,
    	"value": "V"
    }, {
    	"row": 2,
    	"value": "B"
    }, {
    	"row": 2,
    	"value": "N"
    }, {
    	"row": 2,
    	"value": "M"
    }, {
    	"row": 2,
    	"value": "Backspace"
    }];

    var backspaceSVG = `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-delete"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>`;

    var enterSVG = `<svg width="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-corner-down-left"><polyline points="9 10 4 15 9 20"></polyline><path d="M20 4v7a4 4 0 0 1-4 4H4"></path></svg>`;

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\node_modules\svelte-keyboard\src\Keyboard.svelte generated by Svelte v3.59.2 */

    function get_each_context$4(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[25] = list[i];
    	child_ctx[27] = i;
    	return child_ctx;
    }

    function get_each_context_1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[28] = list[i];
    	return child_ctx;
    }

    function get_each_context_2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[31] = list[i].value;
    	child_ctx[32] = list[i].display;
    	return child_ctx;
    }

    // (93:14) {:else}
    function create_else_block(ctx) {
    	let t_value = /*display*/ ctx[32] + "";
    	let t;

    	return {
    		c() {
    			t = text(t_value);
    		},
    		l(nodes) {
    			t = claim_text(nodes, t_value);
    		},
    		m(target, anchor) {
    			insert_hydration(target, t, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*rowData*/ 8 && t_value !== (t_value = /*display*/ ctx[32] + "")) set_data(t, t_value);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (91:14) {#if display.includes('<svg')}
    function create_if_block$4(ctx) {
    	let html_tag;
    	let raw_value = /*display*/ ctx[32] + "";
    	let html_anchor;

    	return {
    		c() {
    			html_tag = new HtmlTagHydration(false);
    			html_anchor = empty();
    			this.h();
    		},
    		l(nodes) {
    			html_tag = claim_html_tag(nodes, false);
    			html_anchor = empty();
    			this.h();
    		},
    		h() {
    			html_tag.a = html_anchor;
    		},
    		m(target, anchor) {
    			html_tag.m(raw_value, target, anchor);
    			insert_hydration(target, html_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*rowData*/ 8 && raw_value !== (raw_value = /*display*/ ctx[32] + "")) html_tag.p(raw_value);
    		},
    		d(detaching) {
    			if (detaching) detach(html_anchor);
    			if (detaching) html_tag.d();
    		}
    	};
    }

    // (84:10) {#each keys as { value, display }}
    function create_each_block_2(ctx) {
    	let button;
    	let show_if;
    	let button_class_value;
    	let mounted;
    	let dispose;

    	function select_block_type(ctx, dirty) {
    		if (dirty[0] & /*rowData*/ 8) show_if = null;
    		if (show_if == null) show_if = !!/*display*/ ctx[32].includes('<svg');
    		if (show_if) return create_if_block$4;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx, [-1, -1]);
    	let if_block = current_block_type(ctx);

    	function touchstart_handler(...args) {
    		return /*touchstart_handler*/ ctx[19](/*value*/ ctx[31], ...args);
    	}

    	function mousedown_handler(...args) {
    		return /*mousedown_handler*/ ctx[20](/*value*/ ctx[31], ...args);
    	}

    	return {
    		c() {
    			button = element("button");
    			if_block.c();
    			this.h();
    		},
    		l(nodes) {
    			button = claim_element(nodes, "BUTTON", { style: true, class: true });
    			var button_nodes = children(button);
    			if_block.l(button_nodes);
    			button_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			set_style(button, "--w", /*percentWidth*/ ctx[2]);
    			attr(button, "class", button_class_value = "" + (/*style*/ ctx[0] + " key--" + /*value*/ ctx[31] + " svelte-n3ouos"));
    			toggle_class(button, "single", /*value*/ ctx[31].length === 1);
    		},
    		m(target, anchor) {
    			insert_hydration(target, button, anchor);
    			if_block.m(button, null);

    			if (!mounted) {
    				dispose = [
    					listen(button, "touchstart", touchstart_handler),
    					listen(button, "mousedown", mousedown_handler)
    				];

    				mounted = true;
    			}
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;

    			if (current_block_type === (current_block_type = select_block_type(ctx, dirty)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(button, null);
    				}
    			}

    			if (dirty[0] & /*percentWidth*/ 4) {
    				set_style(button, "--w", /*percentWidth*/ ctx[2]);
    			}

    			if (dirty[0] & /*style, rowData*/ 9 && button_class_value !== (button_class_value = "" + (/*style*/ ctx[0] + " key--" + /*value*/ ctx[31] + " svelte-n3ouos"))) {
    				attr(button, "class", button_class_value);
    			}

    			if (dirty[0] & /*style, rowData, rowData*/ 9) {
    				toggle_class(button, "single", /*value*/ ctx[31].length === 1);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (82:6) {#each row as keys}
    function create_each_block_1(ctx) {
    	let div;
    	let each_value_2 = /*keys*/ ctx[28];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div_nodes);
    			}

    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "row row--" + /*i*/ ctx[27] + " svelte-n3ouos");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div, null);
    				}
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*percentWidth, style, rowData, onKey*/ 29) {
    				each_value_2 = /*keys*/ ctx[28];
    				let i;

    				for (i = 0; i < each_value_2.length; i += 1) {
    					const child_ctx = get_each_context_2(ctx, each_value_2, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_2(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_2.length;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    // (80:2) {#each rowData as row, i}
    function create_each_block$4(ctx) {
    	let div;
    	let t;
    	let each_value_1 = /*row*/ ctx[25];
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div_nodes);
    			}

    			t = claim_space(div_nodes);
    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "page svelte-n3ouos");
    			toggle_class(div, "visible", /*i*/ ctx[27] === /*page*/ ctx[1]);
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div, null);
    				}
    			}

    			append_hydration(div, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*rowData, percentWidth, style, onKey*/ 29) {
    				each_value_1 = /*row*/ ctx[25];
    				let i;

    				for (i = 0; i < each_value_1.length; i += 1) {
    					const child_ctx = get_each_context_1(ctx, each_value_1, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block_1(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, t);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value_1.length;
    			}

    			if (dirty[0] & /*page*/ 2) {
    				toggle_class(div, "visible", /*i*/ ctx[27] === /*page*/ ctx[1]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function create_fragment$a(ctx) {
    	let div;
    	let each_value = /*rowData*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	return {
    		c() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div_nodes);
    			}

    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "keyboard");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div, null);
    				}
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*page, rowData, percentWidth, style, onKey*/ 31) {
    				each_value = /*rowData*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$4(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$4(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(div, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    const alphabet = "abcdefghijklmnopqrstuvwxyz";

    function instance$a($$self, $$props, $$invalidate) {
    	let rawData;
    	let data;
    	let page0;
    	let page1;
    	let rows0;
    	let rows1;
    	let rowData0;
    	let rowData1;
    	let rowData;
    	let maxInRow0;
    	let maxInRow1;
    	let maxInRow;
    	let percentWidth;
    	const dispatch = createEventDispatcher();
    	let { custom } = $$props;
    	let { style = "" } = $$props;
    	let { layout = "standard" } = $$props;
    	let page = 0;
    	let shifted = false;
    	const layouts = { standard, crossword };

    	const swaps = {
    		Page0: "abc",
    		Page1: "?123",
    		Space: " ",
    		Shift: "abc",
    		Enter: enterSVG,
    		Backspace: backspaceSVG
    	};

    	const unique = arr => [...new Set(arr)];

    	function onKey(value, event) {
    		event.preventDefault();

    		if (value.includes("Page")) {
    			$$invalidate(1, page = +value.substr(-1));
    		} else if (value === "Shift") {
    			$$invalidate(7, shifted = !shifted);
    		} else {
    			let output = value;
    			if (shifted && alphabet.includes(value)) output = value.toUpperCase();
    			if (value === "Space") output = " ";
    			dispatch("keydown", output);
    		}

    		event.stopPropagation();
    		return false;
    	}

    	const touchstart_handler = (value, e) => onKey(value, e);
    	const mousedown_handler = (value, e) => onKey(value, e);

    	$$self.$$set = $$props => {
    		if ('custom' in $$props) $$invalidate(5, custom = $$props.custom);
    		if ('style' in $$props) $$invalidate(0, style = $$props.style);
    		if ('layout' in $$props) $$invalidate(6, layout = $$props.layout);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*custom, layout*/ 96) {
    			$$invalidate(18, rawData = custom || layouts[layout]);
    		}

    		if ($$self.$$.dirty[0] & /*rawData, shifted*/ 262272) {
    			$$invalidate(17, data = rawData.map(d => {
    				let display = d.display;
    				if (swaps[d.value]) display = swaps[d.value];
    				if (!display) display = shifted ? d.value.toUpperCase() : d.value;
    				if (d.value === "Shift") display = shifted ? swaps[d.value] : swaps[d.value].toUpperCase();
    				return { ...d, display };
    			}));
    		}

    		if ($$self.$$.dirty[0] & /*data*/ 131072) {
    			$$invalidate(15, page0 = data.filter(d => !d.page));
    		}

    		if ($$self.$$.dirty[0] & /*data*/ 131072) {
    			$$invalidate(13, page1 = data.filter(d => d.page));
    		}

    		if ($$self.$$.dirty[0] & /*page0*/ 32768) {
    			$$invalidate(14, rows0 = unique(page0.map(d => d.row)));
    		}

    		if ($$self.$$.dirty[0] & /*rows0*/ 16384) {
    			(rows0.sort((a, b) => a - b));
    		}

    		if ($$self.$$.dirty[0] & /*page1*/ 8192) {
    			$$invalidate(16, rows1 = unique(page1.map(d => d.row)));
    		}

    		if ($$self.$$.dirty[0] & /*rows1*/ 65536) {
    			(rows1.sort((a, b) => a - b));
    		}

    		if ($$self.$$.dirty[0] & /*rows0, page0*/ 49152) {
    			$$invalidate(12, rowData0 = rows0.map(r => page0.filter(k => k.row === r)));
    		}

    		if ($$self.$$.dirty[0] & /*rows0, page1*/ 24576) {
    			$$invalidate(11, rowData1 = rows0.map(r => page1.filter(k => k.row === r)));
    		}

    		if ($$self.$$.dirty[0] & /*rowData0, rowData1*/ 6144) {
    			$$invalidate(3, rowData = [rowData0, rowData1]);
    		}

    		if ($$self.$$.dirty[0] & /*rowData0*/ 4096) {
    			$$invalidate(10, maxInRow0 = Math.max(...rowData0.map(r => r.length)));
    		}

    		if ($$self.$$.dirty[0] & /*rowData1*/ 2048) {
    			$$invalidate(9, maxInRow1 = Math.max(...rowData1.map(r => r.length)));
    		}

    		if ($$self.$$.dirty[0] & /*maxInRow0, maxInRow1*/ 1536) {
    			$$invalidate(8, maxInRow = Math.max(maxInRow0, maxInRow1));
    		}

    		if ($$self.$$.dirty[0] & /*maxInRow*/ 256) {
    			$$invalidate(2, percentWidth = `${1 / maxInRow * 100}%`);
    		}
    	};

    	return [
    		style,
    		page,
    		percentWidth,
    		rowData,
    		onKey,
    		custom,
    		layout,
    		shifted,
    		maxInRow,
    		maxInRow1,
    		maxInRow0,
    		rowData1,
    		rowData0,
    		page1,
    		rows0,
    		page0,
    		rows1,
    		data,
    		rawData,
    		touchstart_handler,
    		mousedown_handler
    	];
    }

    class Keyboard extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, { custom: 5, style: 0, layout: 6 }, null, [-1, -1]);
    	}
    }

    var getSecondarilyFocusedCells = ({ cells, focusedDirection, focusedCell }) => {
      const dimension = focusedDirection == "across" ? "x" : "y";
      const otherDimension = focusedDirection == "across" ? "y" : "x";
      const start = focusedCell[dimension];

      const cellsWithDiff = cells
        .filter(
          (cell) =>
            // take out cells in other columns/rows
            cell[otherDimension] == focusedCell[otherDimension]
        )
        .map((cell) => ({
          ...cell,
          // how far is this cell from our focused cell?
          diff: start - cell[dimension],
        }));
        
    	cellsWithDiff.sort((a, b) => a.diff - b.diff);

      // highlight all cells in same row/column, without any breaks
      const diffs = cellsWithDiff.map((d) => d.diff);
      const indices = range(Math.min(...diffs), Math.max(...diffs)).map((i) =>
        diffs.includes(i) ? i : " "
      );
      const chunks = indices.join(",").split(", ,");
      const currentChunk = (
        chunks.find(
          (d) => d.startsWith("0,") || d.endsWith(",0") || d.includes(",0,")
        ) || ""
      )
        .split(",")
        .map((d) => +d);

      const secondarilyFocusedCellIndices = cellsWithDiff
        .filter((cell) => currentChunk.includes(cell.diff))
        .map((cell) => cell.index);
      return secondarilyFocusedCellIndices;
    };

    const range = (min, max) =>
      Array.from({ length: max - min + 1 }, (v, k) => k + min);

    var getCellAfterDiff = ({ diff, cells, direction, focusedCell }) => {
      const dimension = direction == "across" ? "x" : "y";
      const otherDimension = direction == "across" ? "y" : "x";
      const start = focusedCell[dimension];
      const absDiff = Math.abs(diff);
      const isDiffNegative = diff < 0;

      const cellsWithDiff = cells
        .filter(
          (cell) =>
            // take out cells in other columns/rows
            cell[otherDimension] == focusedCell[otherDimension] &&
            // take out cells in wrong direction
            (isDiffNegative ? cell[dimension] < start : cell[dimension] > start)
        )
        .map((cell) => ({
          ...cell,
          // how far is this cell from our focused cell?
          absDiff: Math.abs(start - cell[dimension]),
        }));

      cellsWithDiff.sort((a, b) => a.absDiff - b.absDiff);
      return cellsWithDiff[absDiff - 1];
    };

    function checkMobile() {
    	const devices = {
    		android: () => navigator.userAgent.match(/Android/i),

    		blackberry: () => navigator.userAgent.match(/BlackBerry/i),

    		ios: () => navigator.userAgent.match(/iPhone|iPad|iPod/i),

    		opera: () => navigator.userAgent.match(/Opera Mini/i),

    		windows: () => navigator.userAgent.match(/IEMobile/i),
    	};

    	return devices.android() ||
    		devices.blackberry() ||
    		devices.ios() ||
    		devices.opera() ||
    		devices.windows();
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Cell.svelte generated by Svelte v3.59.2 */

    function create_if_block_1$2(ctx) {
    	let line;

    	return {
    		c() {
    			line = svg_element("line");
    			this.h();
    		},
    		l(nodes) {
    			line = claim_svg_element(nodes, "line", {
    				x1: true,
    				y1: true,
    				x2: true,
    				y2: true,
    				class: true
    			});

    			children(line).forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(line, "x1", "0");
    			attr(line, "y1", "1");
    			attr(line, "x2", "1");
    			attr(line, "y2", "0");
    			attr(line, "class", "svelte-1ysj7tq");
    		},
    		m(target, anchor) {
    			insert_hydration(target, line, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(line);
    		}
    	};
    }

    // (112:2) {#if value}
    function create_if_block$3(ctx) {
    	let text_1;
    	let t;
    	let text_1_transition;
    	let current;

    	return {
    		c() {
    			text_1 = svg_element("text");
    			t = text(/*value*/ ctx[2]);
    			this.h();
    		},
    		l(nodes) {
    			text_1 = claim_svg_element(nodes, "text", {
    				class: true,
    				x: true,
    				y: true,
    				"text-anchor": true
    			});

    			var text_1_nodes = children(text_1);
    			t = claim_text(text_1_nodes, /*value*/ ctx[2]);
    			text_1_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(text_1, "class", "value svelte-1ysj7tq");
    			attr(text_1, "x", "0.5");
    			attr(text_1, "y", "0.75");
    			attr(text_1, "text-anchor", "middle");
    		},
    		m(target, anchor) {
    			insert_hydration(target, text_1, anchor);
    			append_hydration(text_1, t);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (!current || dirty & /*value*/ 4) set_data(t, /*value*/ ctx[2]);
    		},
    		i(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!current) return;

    				if (!text_1_transition) text_1_transition = create_bidirectional_transition(
    					text_1,
    					pop,
    					{
    						y: 5,
    						delay: /*changeDelay*/ ctx[5],
    						duration: /*isRevealing*/ ctx[6] ? 250 : 0
    					},
    					true
    				);

    				text_1_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			if (!text_1_transition) text_1_transition = create_bidirectional_transition(
    				text_1,
    				pop,
    				{
    					y: 5,
    					delay: /*changeDelay*/ ctx[5],
    					duration: /*isRevealing*/ ctx[6] ? 250 : 0
    				},
    				false
    			);

    			text_1_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(text_1);
    			if (detaching && text_1_transition) text_1_transition.end();
    		}
    	};
    }

    function create_fragment$9(ctx) {
    	let g;
    	let rect;
    	let if_block0_anchor;
    	let text_1;
    	let t;
    	let g_class_value;
    	let g_transform_value;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*showCheck*/ ctx[10] && !/*correct*/ ctx[11] && create_if_block_1$2();
    	let if_block1 = /*value*/ ctx[2] && create_if_block$3(ctx);

    	return {
    		c() {
    			g = svg_element("g");
    			rect = svg_element("rect");
    			if (if_block0) if_block0.c();
    			if_block0_anchor = empty();
    			if (if_block1) if_block1.c();
    			text_1 = svg_element("text");
    			t = text(/*number*/ ctx[3]);
    			this.h();
    		},
    		l(nodes) {
    			g = claim_svg_element(nodes, "g", {
    				class: true,
    				transform: true,
    				tabindex: true
    			});

    			var g_nodes = children(g);

    			rect = claim_svg_element(g_nodes, "rect", {
    				width: true,
    				height: true,
    				rx: true,
    				class: true
    			});

    			children(rect).forEach(detach);
    			if (if_block0) if_block0.l(g_nodes);
    			if_block0_anchor = empty();
    			if (if_block1) if_block1.l(g_nodes);

    			text_1 = claim_svg_element(g_nodes, "text", {
    				class: true,
    				x: true,
    				y: true,
    				"text-anchor": true
    			});

    			var text_1_nodes = children(text_1);
    			t = claim_text(text_1_nodes, /*number*/ ctx[3]);
    			text_1_nodes.forEach(detach);
    			g_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(rect, "width", "1");
    			attr(rect, "height", "1");
    			attr(rect, "rx", "0.2");
    			attr(rect, "class", "svelte-1ysj7tq");
    			attr(text_1, "class", "number svelte-1ysj7tq");
    			attr(text_1, "x", "0.08");
    			attr(text_1, "y", "0.3");
    			attr(text_1, "text-anchor", "start");
    			attr(g, "class", g_class_value = "cell " + /*custom*/ ctx[4] + " cell-" + /*x*/ ctx[0] + "-" + /*y*/ ctx[1] + " svelte-1ysj7tq");
    			attr(g, "transform", g_transform_value = `translate(${/*x*/ ctx[0]}, ${/*y*/ ctx[1]})`);
    			attr(g, "tabindex", "0");
    			toggle_class(g, "is-focused", /*isFocused*/ ctx[7]);
    			toggle_class(g, "is-secondarily-focused", /*isSecondarilyFocused*/ ctx[8]);
    			toggle_class(g, "is-correct", /*showCheck*/ ctx[10] && /*correct*/ ctx[11]);
    			toggle_class(g, "is-incorrect", /*showCheck*/ ctx[10] && !/*correct*/ ctx[11]);
    		},
    		m(target, anchor) {
    			insert_hydration(target, g, anchor);
    			append_hydration(g, rect);
    			if (if_block0) if_block0.m(g, null);
    			append_hydration(g, if_block0_anchor);
    			if (if_block1) if_block1.m(g, null);
    			append_hydration(g, text_1);
    			append_hydration(text_1, t);
    			/*g_binding*/ ctx[23](g);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen(g, "click", /*onClick*/ ctx[13]),
    					listen(g, "keydown", /*onKeydown*/ ctx[12])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (/*showCheck*/ ctx[10] && !/*correct*/ ctx[11]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_1$2();
    					if_block0.c();
    					if_block0.m(g, if_block0_anchor);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*value*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty & /*value*/ 4) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block$3(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(g, text_1);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*number*/ 8) set_data(t, /*number*/ ctx[3]);

    			if (!current || dirty & /*custom, x, y*/ 19 && g_class_value !== (g_class_value = "cell " + /*custom*/ ctx[4] + " cell-" + /*x*/ ctx[0] + "-" + /*y*/ ctx[1] + " svelte-1ysj7tq")) {
    				attr(g, "class", g_class_value);
    			}

    			if (!current || dirty & /*x, y*/ 3 && g_transform_value !== (g_transform_value = `translate(${/*x*/ ctx[0]}, ${/*y*/ ctx[1]})`)) {
    				attr(g, "transform", g_transform_value);
    			}

    			if (!current || dirty & /*custom, x, y, isFocused*/ 147) {
    				toggle_class(g, "is-focused", /*isFocused*/ ctx[7]);
    			}

    			if (!current || dirty & /*custom, x, y, isSecondarilyFocused*/ 275) {
    				toggle_class(g, "is-secondarily-focused", /*isSecondarilyFocused*/ ctx[8]);
    			}

    			if (!current || dirty & /*custom, x, y, showCheck, correct*/ 3091) {
    				toggle_class(g, "is-correct", /*showCheck*/ ctx[10] && /*correct*/ ctx[11]);
    			}

    			if (!current || dirty & /*custom, x, y, showCheck, correct*/ 3091) {
    				toggle_class(g, "is-incorrect", /*showCheck*/ ctx[10] && !/*correct*/ ctx[11]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(g);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			/*g_binding*/ ctx[23](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function pop(node, { delay = 0, duration = 250 }) {
    	return {
    		delay,
    		duration,
    		css: t => [`transform: translate(0, ${1 - t}px)`].join(";"), //
    		
    	};
    }

    function instance$9($$self, $$props, $$invalidate) {
    	let correct;
    	let showCheck;
    	let { x } = $$props;
    	let { y } = $$props;
    	let { value } = $$props;
    	let { answer } = $$props;
    	let { number } = $$props;
    	let { index } = $$props;
    	let { custom } = $$props;
    	let { changeDelay = 0 } = $$props;
    	let { isRevealing = false } = $$props;
    	let { isChecking = false } = $$props;
    	let { isFocused = false } = $$props;
    	let { isSecondarilyFocused = false } = $$props;

    	let { onFocusCell = () => {
    		
    	} } = $$props;

    	let { onCellUpdate = () => {
    		
    	} } = $$props;

    	let { onFocusClueDiff = () => {
    		
    	} } = $$props;

    	let { onMoveFocus = () => {
    		
    	} } = $$props;

    	let { onFlipDirection = () => {
    		
    	} } = $$props;

    	let { onHistoricalChange = () => {
    		
    	} } = $$props;

    	let element;

    	function onFocusSelf() {
    		if (!element) return;
    		if (isFocused) element.focus();
    	}

    	function onKeydown(e) {
    		if (e.ctrlKey && e.key.toLowerCase() == "z") {
    			onHistoricalChange(e.shiftKey ? 1 : -1);
    		}

    		if (e.ctrlKey) return;
    		if (e.altKey) return;

    		if (e.key === "Tab") {
    			onFocusClueDiff(e.shiftKey ? -1 : 1);
    			e.preventDefault();
    			e.stopPropagation();
    			return;
    		}

    		if (e.key == " ") {
    			onFlipDirection();
    			e.preventDefault();
    			e.stopPropagation();
    			return;
    		}

    		if (["Delete", "Backspace"].includes(e.key)) {
    			onCellUpdate(index, "", -1, true);
    			return;
    		}

    		const isKeyInAlphabet = (/^[a-zA-Z()]$/).test(e.key);

    		if (isKeyInAlphabet) {
    			onCellUpdate(index, e.key.toUpperCase());
    			return;
    		}

    		const diff = ({
    			ArrowLeft: ["across", -1],
    			ArrowRight: ["across", 1],
    			ArrowUp: ["down", -1],
    			ArrowDown: ["down", 1]
    		})[e.key];

    		if (diff) {
    			onMoveFocus(...diff);
    			e.preventDefault();
    			e.stopPropagation();
    			return;
    		}
    	}

    	function onClick() {
    		onFocusCell(index);
    	}

    	function g_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			element = $$value;
    			$$invalidate(9, element);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('x' in $$props) $$invalidate(0, x = $$props.x);
    		if ('y' in $$props) $$invalidate(1, y = $$props.y);
    		if ('value' in $$props) $$invalidate(2, value = $$props.value);
    		if ('answer' in $$props) $$invalidate(14, answer = $$props.answer);
    		if ('number' in $$props) $$invalidate(3, number = $$props.number);
    		if ('index' in $$props) $$invalidate(15, index = $$props.index);
    		if ('custom' in $$props) $$invalidate(4, custom = $$props.custom);
    		if ('changeDelay' in $$props) $$invalidate(5, changeDelay = $$props.changeDelay);
    		if ('isRevealing' in $$props) $$invalidate(6, isRevealing = $$props.isRevealing);
    		if ('isChecking' in $$props) $$invalidate(16, isChecking = $$props.isChecking);
    		if ('isFocused' in $$props) $$invalidate(7, isFocused = $$props.isFocused);
    		if ('isSecondarilyFocused' in $$props) $$invalidate(8, isSecondarilyFocused = $$props.isSecondarilyFocused);
    		if ('onFocusCell' in $$props) $$invalidate(17, onFocusCell = $$props.onFocusCell);
    		if ('onCellUpdate' in $$props) $$invalidate(18, onCellUpdate = $$props.onCellUpdate);
    		if ('onFocusClueDiff' in $$props) $$invalidate(19, onFocusClueDiff = $$props.onFocusClueDiff);
    		if ('onMoveFocus' in $$props) $$invalidate(20, onMoveFocus = $$props.onMoveFocus);
    		if ('onFlipDirection' in $$props) $$invalidate(21, onFlipDirection = $$props.onFlipDirection);
    		if ('onHistoricalChange' in $$props) $$invalidate(22, onHistoricalChange = $$props.onHistoricalChange);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*isFocused*/ 128) {
    			(onFocusSelf());
    		}

    		if ($$self.$$.dirty & /*answer, value*/ 16388) {
    			$$invalidate(11, correct = answer === value);
    		}

    		if ($$self.$$.dirty & /*isChecking, value*/ 65540) {
    			$$invalidate(10, showCheck = isChecking && value);
    		}
    	};

    	return [
    		x,
    		y,
    		value,
    		number,
    		custom,
    		changeDelay,
    		isRevealing,
    		isFocused,
    		isSecondarilyFocused,
    		element,
    		showCheck,
    		correct,
    		onKeydown,
    		onClick,
    		answer,
    		index,
    		isChecking,
    		onFocusCell,
    		onCellUpdate,
    		onFocusClueDiff,
    		onMoveFocus,
    		onFlipDirection,
    		onHistoricalChange,
    		g_binding
    	];
    }

    class Cell extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$9, create_fragment$9, safe_not_equal, {
    			x: 0,
    			y: 1,
    			value: 2,
    			answer: 14,
    			number: 3,
    			index: 15,
    			custom: 4,
    			changeDelay: 5,
    			isRevealing: 6,
    			isChecking: 16,
    			isFocused: 7,
    			isSecondarilyFocused: 8,
    			onFocusCell: 17,
    			onCellUpdate: 18,
    			onFocusClueDiff: 19,
    			onMoveFocus: 20,
    			onFlipDirection: 21,
    			onHistoricalChange: 22
    		});
    	}
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Puzzle.svelte generated by Svelte v3.59.2 */

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[36] = list[i].x;
    	child_ctx[37] = list[i].y;
    	child_ctx[38] = list[i].value;
    	child_ctx[39] = list[i].answer;
    	child_ctx[40] = list[i].index;
    	child_ctx[41] = list[i].number;
    	child_ctx[42] = list[i].custom;
    	return child_ctx;
    }

    // (217:4) {#each cells as { x, y, value, answer, index, number, custom }}
    function create_each_block$3(ctx) {
    	let cell;
    	let current;

    	cell = new Cell({
    			props: {
    				x: /*x*/ ctx[36],
    				y: /*y*/ ctx[37],
    				index: /*index*/ ctx[40],
    				value: /*value*/ ctx[38],
    				answer: /*answer*/ ctx[39],
    				number: /*number*/ ctx[41],
    				custom: /*custom*/ ctx[42],
    				changeDelay: /*isRevealing*/ ctx[2]
    				? /*revealDuration*/ ctx[6] / /*cells*/ ctx[0].length * /*index*/ ctx[40]
    				: 0,
    				isRevealing: /*isRevealing*/ ctx[2],
    				isChecking: /*isChecking*/ ctx[3],
    				isFocused: /*focusedCellIndex*/ ctx[1] == /*index*/ ctx[40] && !/*isDisableHighlight*/ ctx[4],
    				isSecondarilyFocused: /*secondarilyFocusedCells*/ ctx[10].includes(/*index*/ ctx[40]) && !/*isDisableHighlight*/ ctx[4],
    				onFocusCell: /*onFocusCell*/ ctx[16],
    				onCellUpdate: /*onCellUpdate*/ ctx[14],
    				onFocusClueDiff: /*onFocusClueDiff*/ ctx[17],
    				onMoveFocus: /*onMoveFocus*/ ctx[18],
    				onFlipDirection: /*onFlipDirection*/ ctx[19],
    				onHistoricalChange: /*onHistoricalChange*/ ctx[15]
    			}
    		});

    	return {
    		c() {
    			create_component(cell.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(cell.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(cell, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const cell_changes = {};
    			if (dirty[0] & /*cells*/ 1) cell_changes.x = /*x*/ ctx[36];
    			if (dirty[0] & /*cells*/ 1) cell_changes.y = /*y*/ ctx[37];
    			if (dirty[0] & /*cells*/ 1) cell_changes.index = /*index*/ ctx[40];
    			if (dirty[0] & /*cells*/ 1) cell_changes.value = /*value*/ ctx[38];
    			if (dirty[0] & /*cells*/ 1) cell_changes.answer = /*answer*/ ctx[39];
    			if (dirty[0] & /*cells*/ 1) cell_changes.number = /*number*/ ctx[41];
    			if (dirty[0] & /*cells*/ 1) cell_changes.custom = /*custom*/ ctx[42];

    			if (dirty[0] & /*isRevealing, revealDuration, cells*/ 69) cell_changes.changeDelay = /*isRevealing*/ ctx[2]
    			? /*revealDuration*/ ctx[6] / /*cells*/ ctx[0].length * /*index*/ ctx[40]
    			: 0;

    			if (dirty[0] & /*isRevealing*/ 4) cell_changes.isRevealing = /*isRevealing*/ ctx[2];
    			if (dirty[0] & /*isChecking*/ 8) cell_changes.isChecking = /*isChecking*/ ctx[3];
    			if (dirty[0] & /*focusedCellIndex, cells, isDisableHighlight*/ 19) cell_changes.isFocused = /*focusedCellIndex*/ ctx[1] == /*index*/ ctx[40] && !/*isDisableHighlight*/ ctx[4];
    			if (dirty[0] & /*secondarilyFocusedCells, cells, isDisableHighlight*/ 1041) cell_changes.isSecondarilyFocused = /*secondarilyFocusedCells*/ ctx[10].includes(/*index*/ ctx[40]) && !/*isDisableHighlight*/ ctx[4];
    			cell.$set(cell_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cell.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cell.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cell, detaching);
    		}
    	};
    }

    // (241:0) {#if keyboardVisible}
    function create_if_block$2(ctx) {
    	let div;
    	let keyboard;
    	let current;

    	keyboard = new Keyboard({
    			props: {
    				layout: "crossword",
    				style: /*keyboardStyle*/ ctx[8]
    			}
    		});

    	keyboard.$on("keydown", /*onKeydown*/ ctx[20]);

    	return {
    		c() {
    			div = element("div");
    			create_component(keyboard.$$.fragment);
    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			claim_component(keyboard.$$.fragment, div_nodes);
    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "keyboard keyboard-container svelte-1mjakjx");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);
    			mount_component(keyboard, div, null);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const keyboard_changes = {};
    			if (dirty[0] & /*keyboardStyle*/ 256) keyboard_changes.style = /*keyboardStyle*/ ctx[8];
    			keyboard.$set(keyboard_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(keyboard.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(keyboard.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(keyboard);
    		}
    	};
    }

    function create_fragment$8(ctx) {
    	let section;
    	let svg;
    	let svg_viewBox_value;
    	let t;
    	let if_block_anchor;
    	let current;
    	let mounted;
    	let dispose;
    	let each_value = /*cells*/ ctx[0];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	let if_block = /*keyboardVisible*/ ctx[11] && create_if_block$2(ctx);

    	return {
    		c() {
    			section = element("section");
    			svg = svg_element("svg");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    			this.h();
    		},
    		l(nodes) {
    			section = claim_element(nodes, "SECTION", { class: true });
    			var section_nodes = children(section);
    			svg = claim_svg_element(section_nodes, "svg", { viewBox: true, class: true });
    			var svg_nodes = children(svg);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(svg_nodes);
    			}

    			svg_nodes.forEach(detach);
    			section_nodes.forEach(detach);
    			t = claim_space(nodes);
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    			this.h();
    		},
    		h() {
    			attr(svg, "viewBox", svg_viewBox_value = "0 0 " + /*w*/ ctx[13] + " " + /*h*/ ctx[12]);
    			attr(svg, "class", "svelte-1mjakjx");
    			attr(section, "class", "puzzle svelte-1mjakjx");
    			toggle_class(section, "stacked", /*stacked*/ ctx[5]);
    			toggle_class(section, "is-loaded", /*isLoaded*/ ctx[7]);
    		},
    		m(target, anchor) {
    			insert_hydration(target, section, anchor);
    			append_hydration(section, svg);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(svg, null);
    				}
    			}

    			/*section_binding*/ ctx[27](section);
    			insert_hydration(target, t, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration(target, if_block_anchor, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen(window, "click", /*onClick*/ ctx[21]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*cells, isRevealing, revealDuration, isChecking, focusedCellIndex, isDisableHighlight, secondarilyFocusedCells, onFocusCell, onCellUpdate, onFocusClueDiff, onMoveFocus, onFlipDirection, onHistoricalChange*/ 1033311) {
    				each_value = /*cells*/ ctx[0];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(svg, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if (!current || dirty[0] & /*w, h*/ 12288 && svg_viewBox_value !== (svg_viewBox_value = "0 0 " + /*w*/ ctx[13] + " " + /*h*/ ctx[12])) {
    				attr(svg, "viewBox", svg_viewBox_value);
    			}

    			if (!current || dirty[0] & /*stacked*/ 32) {
    				toggle_class(section, "stacked", /*stacked*/ ctx[5]);
    			}

    			if (!current || dirty[0] & /*isLoaded*/ 128) {
    				toggle_class(section, "is-loaded", /*isLoaded*/ ctx[7]);
    			}

    			if (/*keyboardVisible*/ ctx[11]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*keyboardVisible*/ 2048) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(section);
    			destroy_each(each_blocks, detaching);
    			/*section_binding*/ ctx[27](null);
    			if (detaching) detach(t);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    const numberOfStatesInHistory = 10;

    function instance$8($$self, $$props, $$invalidate) {
    	let w;
    	let h;
    	let keyboardVisible;
    	let sortedCellsInDirection;
    	let { clues } = $$props;
    	let { cells } = $$props;
    	let { focusedDirection } = $$props;
    	let { focusedCellIndex } = $$props;
    	let { focusedCell } = $$props;
    	let { isRevealing } = $$props;
    	let { isChecking } = $$props;
    	let { isDisableHighlight } = $$props;
    	let { stacked } = $$props;
    	let { revealDuration = 0 } = $$props;
    	let { showKeyboard } = $$props;
    	let { isLoaded } = $$props;
    	let { keyboardStyle } = $$props;
    	let element;
    	let cellsHistoryIndex = 0;
    	let cellsHistory = [];
    	let focusedCellIndexHistory = [];
    	let secondarilyFocusedCells = [];
    	let isMobile = false;
    	let isPuzzleFocused = false;

    	onMount(() => {
    		$$invalidate(26, isMobile = checkMobile());
    		onFocusCell(14);
    	});

    	function updateSecondarilyFocusedCells() {
    		$$invalidate(10, secondarilyFocusedCells = getSecondarilyFocusedCells({ cells, focusedDirection, focusedCell }));
    	}

    	function onCellUpdate(index, newValue, diff = 1, doReplaceFilledCells) {
    		doReplaceFilledCells = doReplaceFilledCells || !!cells[index].value;
    		const dimension = focusedDirection == "across" ? "x" : "y";
    		const clueIndex = cells[index].clueNumbers[focusedDirection];
    		const cellsInClue = cells.filter(cell => cell.clueNumbers[focusedDirection] == clueIndex && (doReplaceFilledCells || !cell.value));
    		const cellsInCluePositions = cellsInClue.map(cell => cell[dimension]).filter(Number.isFinite);
    		const isAtEndOfClue = cells[index][dimension] == Math.max(...cellsInCluePositions);

    		const newCells = [
    			...cells.slice(0, index),
    			{
    				...cells[index],
    				value: cells[index].show ? cells[index].answer : newValue
    			},
    			...cells.slice(index + 1)
    		];

    		cellsHistory = [newCells, ...cellsHistory.slice(cellsHistoryIndex)].slice(0, numberOfStatesInHistory);
    		cellsHistoryIndex = 0;
    		$$invalidate(0, cells = newCells);
    		const activeCells = getSecondarilyFocusedCells({ cells, focusedDirection, focusedCell });

    		if (diff < 0 && index === activeCells[activeCells.length - 1]) {
    			// FIX:回退删除cell内容限制在当前word中
    			return;
    		}

    		if (isAtEndOfClue && diff > 0) {
    			onFocusClueDiff(diff);
    		} else {
    			onFocusCellDiff(diff, doReplaceFilledCells);
    		}
    	}

    	function onHistoricalChange(diff) {
    		cellsHistoryIndex += -diff;
    		$$invalidate(0, cells = cellsHistory[cellsHistoryIndex] || cells);
    		$$invalidate(1, focusedCellIndex = focusedCellIndexHistory[cellsHistoryIndex] || focusedCellIndex);
    	}

    	function onFocusCell(index) {
    		if (isPuzzleFocused && index == focusedCellIndex) {
    			onFlipDirection();
    		} else {
    			$$invalidate(1, focusedCellIndex = index);

    			if (!cells[focusedCellIndex].clueNumbers[focusedDirection]) {
    				const newDirection = focusedDirection === "across" ? "down" : "across";
    				$$invalidate(22, focusedDirection = newDirection);
    			}

    			focusedCellIndexHistory = [index, ...focusedCellIndexHistory.slice(0, numberOfStatesInHistory)];
    		}
    	}

    	function onFocusCellDiff(diff, doReplaceFilledCells = true) {
    		const sortedCellsInDirectionFiltered = sortedCellsInDirection.filter(d => doReplaceFilledCells ? true : !d.value);
    		const currentCellIndex = sortedCellsInDirectionFiltered.findIndex(d => d.index == focusedCellIndex);
    		const nextCellIndex = (sortedCellsInDirectionFiltered[currentCellIndex + diff] || {}).index;
    		const nextCell = cells[nextCellIndex];
    		if (!nextCell) return;
    		onFocusCell(nextCellIndex);
    	}

    	function onFocusClueDiff(diff = 1) {
    		const currentNumber = focusedCell.clueNumbers[focusedDirection];

    		let nextCluesInDirection = clues.filter(clue => {
    			return !clue.isFilled && (diff > 0
    			? clue.number > currentNumber
    			: clue.number < currentNumber) && clue.direction == focusedDirection;
    		});

    		if (diff < 0) {
    			nextCluesInDirection = nextCluesInDirection.reverse();
    		}

    		let nextClue = nextCluesInDirection[Math.abs(diff) - 1];

    		if (!nextClue) {
    			onFlipDirection();
    			nextClue = clues.filter(clue => clue.direction == focusedDirection)[0];
    		}

    		const nextFocusedCell = sortedCellsInDirection.find(cell => !cell.value && cell.clueNumbers[focusedDirection] == nextClue.number) || {};
    		$$invalidate(1, focusedCellIndex = nextFocusedCell.index || 0);
    	}

    	function onMoveFocus(direction, diff) {
    		if (focusedDirection != direction) {
    			$$invalidate(22, focusedDirection = direction);
    		} else {
    			const nextCell = getCellAfterDiff({ diff, cells, direction, focusedCell });
    			if (!nextCell) return;
    			onFocusCell(nextCell.index);
    		}
    	}

    	function onFlipDirection() {
    		// FIX: 无法全部自动填充问题
    		// let newDirection = focusedDirection === "across" ? "down" : "across";
    		let newDirection;

    		if (focusedDirection === "across") {
    			newDirection = "down";
    		} else if (focusedDirection === "down") {
    			$$invalidate(22, focusedDirection = "across");
    		}

    		const hasClueInNewDirection = !!focusedCell["clueNumbers"][newDirection];
    		if (hasClueInNewDirection) $$invalidate(22, focusedDirection = newDirection);
    	}

    	function onKeydown({ detail }) {
    		const diff = detail === "Backspace" ? -1 : 1;
    		const value = detail === "Backspace" ? "" : detail;
    		const doReplaceFilledCells = detail === "Backspace" ? true : false;
    		onCellUpdate(focusedCellIndex, value, diff, doReplaceFilledCells);
    	}

    	function onClick() {
    		isPuzzleFocused = element.contains(document.activeElement);
    	}

    	function section_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			element = $$value;
    			$$invalidate(9, element);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('clues' in $$props) $$invalidate(23, clues = $$props.clues);
    		if ('cells' in $$props) $$invalidate(0, cells = $$props.cells);
    		if ('focusedDirection' in $$props) $$invalidate(22, focusedDirection = $$props.focusedDirection);
    		if ('focusedCellIndex' in $$props) $$invalidate(1, focusedCellIndex = $$props.focusedCellIndex);
    		if ('focusedCell' in $$props) $$invalidate(24, focusedCell = $$props.focusedCell);
    		if ('isRevealing' in $$props) $$invalidate(2, isRevealing = $$props.isRevealing);
    		if ('isChecking' in $$props) $$invalidate(3, isChecking = $$props.isChecking);
    		if ('isDisableHighlight' in $$props) $$invalidate(4, isDisableHighlight = $$props.isDisableHighlight);
    		if ('stacked' in $$props) $$invalidate(5, stacked = $$props.stacked);
    		if ('revealDuration' in $$props) $$invalidate(6, revealDuration = $$props.revealDuration);
    		if ('showKeyboard' in $$props) $$invalidate(25, showKeyboard = $$props.showKeyboard);
    		if ('isLoaded' in $$props) $$invalidate(7, isLoaded = $$props.isLoaded);
    		if ('keyboardStyle' in $$props) $$invalidate(8, keyboardStyle = $$props.keyboardStyle);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*cells*/ 1) {
    			$$invalidate(13, w = Math.max(...cells.map(d => d.x)) + 1);
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 1) {
    			$$invalidate(12, h = Math.max(...cells.map(d => d.y)) + 1);
    		}

    		if ($$self.$$.dirty[0] & /*showKeyboard, isMobile*/ 100663296) {
    			$$invalidate(11, keyboardVisible = typeof showKeyboard === "boolean"
    			? showKeyboard
    			: isMobile);
    		}

    		if ($$self.$$.dirty[0] & /*cells, focusedCellIndex, focusedDirection*/ 4194307) {
    			(updateSecondarilyFocusedCells());
    		}

    		if ($$self.$$.dirty[0] & /*cells, focusedDirection*/ 4194305) {
    			sortedCellsInDirection = [...cells].sort((a, b) => focusedDirection == "down"
    			? a.x - b.x || a.y - b.y
    			: a.y - b.y || a.x - b.x);
    		}
    	};

    	return [
    		cells,
    		focusedCellIndex,
    		isRevealing,
    		isChecking,
    		isDisableHighlight,
    		stacked,
    		revealDuration,
    		isLoaded,
    		keyboardStyle,
    		element,
    		secondarilyFocusedCells,
    		keyboardVisible,
    		h,
    		w,
    		onCellUpdate,
    		onHistoricalChange,
    		onFocusCell,
    		onFocusClueDiff,
    		onMoveFocus,
    		onFlipDirection,
    		onKeydown,
    		onClick,
    		focusedDirection,
    		clues,
    		focusedCell,
    		showKeyboard,
    		isMobile,
    		section_binding
    	];
    }

    class Puzzle extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$8,
    			create_fragment$8,
    			safe_not_equal,
    			{
    				clues: 23,
    				cells: 0,
    				focusedDirection: 22,
    				focusedCellIndex: 1,
    				focusedCell: 24,
    				isRevealing: 2,
    				isChecking: 3,
    				isDisableHighlight: 4,
    				stacked: 5,
    				revealDuration: 6,
    				showKeyboard: 25,
    				isLoaded: 7,
    				keyboardStyle: 8
    			},
    			null,
    			[-1, -1]
    		);
    	}
    }

    function scrollTO (node, isFocused) {
      return {
        update(newIsFocused) {
          isFocused = newIsFocused;
          if (!isFocused) return;
          const list = node.parentElement.parentElement;
          if (!list) return;

          const top = node.offsetTop;
          const currentYTop = list.scrollTop;
          const currentYBottom = currentYTop + list.clientHeight;
          const buffer = 50;
          if (top < currentYTop + buffer || top > currentYBottom - buffer) {
            list.scrollTo({ top: top, behavior: "smooth" });
          }
        },
      };
    }

    const Modal = (function () {
        let instance;
        let isOpen = false;
        let ms = '';
        let _params = {};
        let ids = {}; // 缓存content header等

        function createModal(message, params = {}) {
            ms = message;
            _params = params;

            !ids[params.id] && (ids[params.id] = {
                header: params.header ? params.header : '',
                message: message,
                class: params.class ? params.class : ''
            });

            // 创建模态框 DOM 结构
            const modal = document.createElement('div');
            modal.classList.add('modal');
            modal.classList.add('modal-container');
            modal.classList.add('modal-container__crossword');
            const modalContent = document.createElement('div');
            modalContent.classList.add('modal-content');

            const closeBtn = document.createElement('span');
            closeBtn.classList.add('close');
            closeBtn.innerHTML = '&times;';

            const messageEl = document.createElement('div');
            messageEl.classList.add('modal-content-body');
            // messageEl.textContent = message;
            if(message instanceof HTMLElement) {
                messageEl.appendChild(message);
            }
            if(typeof message === 'string') {
                messageEl.innerHTML = message;
            }

            // const confirmBtn = document.createElement('div');
            // confirmBtn.classList.add('modal-content-');

            const modalHeader = document.createElement('div');
            const modalHeaderContent = document.createElement('div');
            modalHeaderContent.classList.add('moadal-header-content');
            modalHeaderContent.textContent = _params.header ? _params.header : '';
            modalHeader.classList.add('moadal-header');
            modalHeader.appendChild(modalHeaderContent);
            modalHeader.appendChild(closeBtn);

            modalContent.appendChild(modalHeader);
            // modalContent.appendChild(closeBtn);
            modalContent.appendChild(messageEl);
            // modalContent.appendChild(confirmBtn);

            modal.appendChild(modalContent);

            // 添加事件监听器
            closeBtn.addEventListener('click', function () {
                closeModal();
            });

            // confirmBtn.addEventListener('click', function () {
            //     closeModal();
            //     if (params.cb && typeof params.cb === 'function') {
            //         params.cb();
            //     }
            // });

            // 添加到文档中
            document.body.appendChild(modal);

            // 显示模态框
            modal.classList.add('fade-in');
            isOpen = true;
            // 禁止body滚动
            document.body.classList.add('overflow-hidden');

            if (params.cb && typeof params.cb === 'function') {
                params.cb(modal);
            }

            function closeModal() {
                modal.classList.add('fade-out');
                modal.querySelector('.modal-content').classList.add('slide-out');
                setTimeout(function () {
                    modal.style.display = 'none';
                    modal.classList.remove('fade-out');
                    modal.querySelector('.modal-content').classList.remove('slide-out');
                    isOpen = false;
                    // 恢复body滚动
                    document.body.classList.remove('overflow-hidden');
                }, 300);

                // 设置focus cell
                document.querySelector(".is-focused.is-secondarily-focused") && document.querySelector(".is-focused.is-secondarily-focused").focus();
            }

            // 按下 ESC 键关闭模态框
            document.addEventListener('keydown', function (e) {
                if (isOpen && e.keyCode === 27) {
                    closeModal();
                }
            });

            // 点击模态框外部区域关闭模态框
            modal.addEventListener('click', function (e) {
                if (e.target === modal) {
                    closeModal();
                }
            });

            // 新调用更像content
            function updateMessage(newMessage) {
                ms = newMessage;
                if(newMessage instanceof HTMLElement) {
                    messageEl.innerHTML = '';
                    messageEl.appendChild(newMessage);
                }
                if(typeof newMessage === 'string') {
                    messageEl.innerHTML = newMessage;
                }
            }

            function updateHeader(newMessage) {
                _params.header = newMessage || '';
                modalHeaderContent.innerHTML = newMessage;
            }

            function updateClass(newClass) {
                newClass = newClass ? newClass : 'no-class';
                modal.classList.remove(...modal.classList);
                modal.classList.add(newClass, 'fade-in', 'modal-container', 'modal');
            }

            function openModal(params) {
                updateClass(params.class);
                modal.style.display = 'flex';
                isOpen = true;
                // 禁止body滚动
                document.body.classList.add('overflow-hidden');
                if (params.cb && typeof params.cb === 'function') {
                    params.cb(modal);
                }
            }

            return {
                closeModal,
                openModal,
                updateMessage,
                updateHeader,
                updateClass
            };
        }

        return {
            getInstance: function (message, params = {}) {
                if (!instance) {
                    instance = createModal(message, params);
                    instance.updateClass(params.class);
                } else {
                    !ids[params.id] && (ids[params.id] = {
                        header: params.header ? params.header : '',
                        message: message,
                        class: params.class ? params.class : ''
                    });
                    if (ids[params.id]) {
                        instance.updateMessage(ids[params.id].message);
                        instance.updateHeader(ids[params.id].header);
                    } else {
                        if (ms !== message) {
                            instance.updateMessage(message);
                        }
                        if (params.header !== _params.header) {
                            instance.updateHeader(params.header);
                        }
                    }
                    instance.openModal(params);
                }
                return instance;
            }
        };
    })();

    var tips = [
    	{
    		title: "WORD: FASTCHARGING",
    		des: "Jackery Solar Generator offers industry-leading solar and wall charging efficiency, ensuring you're always powered on the go."
    	},
    	{
    		title: "WORD: CHARGESHIELD",
    		des: "Jackery's patented battery innovation technology that effectively enhances safety and increases battery pack lifespan by 50%"
    	},
    	{
    		title: "WORD: SOLARGENERATOR",
    		des: "A solar power system that combines a portable power station with solar panels. It emits no toxic gases, operating extremely cleanly - causing no environmental harm."
    	},
    	{
    		title: "WORD: HOMEBACKUP",
    		des: "Jackery Solar Generators are suitable for home backup, providing power for your household appliances, refrigerators, and more."
    	},
    	{
    		title: "WORD: CAMPING",
    		des: "Jackery Solar Generators are used for camping, providing portable power for your outdoor equipment like CPAP, electric grill, and airfryer!"
    	},
    	{
    		title: "WORD: GLOBALLEADINGBRAND",
    		des: "Jackery has been deeply involved in the energy storage industry for 11 years, with over 3 million products sold and endorsements from 200+ media outlets."
    	}
    ];

    const handleCrosswordGTM = (params) => {
            try {
                window.dataLayer.push({ event_parameters: null });
                window.dataLayer.push({
                    event: "ga4Event",
                    event_name: "Game_share",
                    event_parameters: {
                    current_page: window.location.href,
                    ...params
                    }
                });
            } catch (error) {
                console.log(error);
            }
    };

    const handleGameGTM = (params) => {
            try {
                window.dataLayer.push({ event_parameters: null });
                window.dataLayer.push({
                    event: "ga4Event",
                    event_name: "Game",
                    event_parameters: {
                    current_page: window.location.href,
                    ...params
                    }
                });
            } catch (error) {
                console.log(error);
            }
    };

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Clue.svelte generated by Svelte v3.59.2 */

    function create_fragment$7(ctx) {
    	let li;
    	let button;
    	let svg;
    	let g;
    	let path0;
    	let path1;
    	let defs;
    	let clipPath;
    	let rect;
    	let button_class_value;
    	let li_class_value;
    	let scrollTo_action;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			li = element("li");
    			button = element("button");
    			svg = svg_element("svg");
    			g = svg_element("g");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			defs = svg_element("defs");
    			clipPath = svg_element("clipPath");
    			rect = svg_element("rect");
    			this.h();
    		},
    		l(nodes) {
    			li = claim_element(nodes, "LI", { class: true });
    			var li_nodes = children(li);
    			button = claim_element(li_nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);

    			svg = claim_svg_element(button_nodes, "svg", {
    				class: true,
    				xmlns: true,
    				viewBox: true,
    				fill: true
    			});

    			var svg_nodes = children(svg);
    			g = claim_svg_element(svg_nodes, "g", { "clip-path": true });
    			var g_nodes = children(g);
    			path0 = claim_svg_element(g_nodes, "path", { d: true, fill: true, class: true });
    			children(path0).forEach(detach);
    			path1 = claim_svg_element(g_nodes, "path", { d: true, fill: true, class: true });
    			children(path1).forEach(detach);
    			g_nodes.forEach(detach);
    			defs = claim_svg_element(svg_nodes, "defs", {});
    			var defs_nodes = children(defs);
    			clipPath = claim_svg_element(defs_nodes, "clipPath", { id: true });
    			var clipPath_nodes = children(clipPath);

    			rect = claim_svg_element(clipPath_nodes, "rect", {
    				width: true,
    				height: true,
    				fill: true,
    				transform: true
    			});

    			children(rect).forEach(detach);
    			clipPath_nodes.forEach(detach);
    			defs_nodes.forEach(detach);
    			svg_nodes.forEach(detach);
    			button_nodes.forEach(detach);
    			li_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(path0, "d", "M13.7995 25.7885C20.0747 25.7885 25.1615 20.7017 25.1615 14.4264C25.1615 8.15119 20.0747 3.0644 13.7995 3.0644C7.52423 3.0644 2.43745 8.15119 2.43745 14.4264C2.43745 20.7017 7.52423 25.7885 13.7995 25.7885ZM13.7995 28.0609C6.26986 28.0609 0.165039 21.9561 0.165039 14.4264C0.165039 6.89682 6.26986 0.791992 13.7995 0.791992C21.3291 0.791992 27.4339 6.89682 27.4339 14.4264C27.4339 21.9561 21.3291 28.0609 13.7995 28.0609Z");
    			attr(path0, "fill", "#A48F86");
    			attr(path0, "class", "svelte-rnei18");
    			attr(path1, "d", "M14.0384 6.97314C12.3796 6.97314 11.0616 7.45035 10.1072 8.42749C9.13004 9.3819 8.65283 10.6772 8.65283 12.336H11.0616C11.0616 11.3362 11.2661 10.5408 11.6751 9.99545C12.1296 9.35917 12.8795 9.04104 13.9021 9.04104C14.7202 9.04104 15.3564 9.26828 15.8109 9.72276C16.2427 10.1772 16.4699 10.7908 16.4699 11.5861C16.4699 12.177 16.2654 12.7223 15.8564 13.245L15.4701 13.6768C14.0612 14.9266 13.1976 15.8583 12.8795 16.4945C12.5841 17.0854 12.4478 17.8125 12.4478 18.6533V19.0396H14.8792V18.6533C14.8792 18.0852 14.9929 17.5853 15.2428 17.1308C15.4473 16.7218 15.7655 16.3355 16.1745 15.9719C17.2653 15.0402 17.9015 14.4494 18.1061 14.1994C18.6514 13.4722 18.9468 12.5405 18.9468 11.4271C18.9468 10.0636 18.4924 8.97286 17.6061 8.17752C16.6972 7.35945 15.5155 6.97314 14.0384 6.97314ZM13.6521 20.2667C13.1749 20.2667 12.7886 20.4031 12.4932 20.7212C12.1523 21.0166 11.9933 21.4029 11.9933 21.8801C11.9933 22.3346 12.1523 22.7209 12.4932 23.0391C12.7886 23.3572 13.1749 23.5163 13.6521 23.5163C14.1066 23.5163 14.5156 23.3572 14.8565 23.0618C15.1746 22.7437 15.3337 22.3574 15.3337 21.8801C15.3337 21.4029 15.1746 21.0166 14.8565 20.7212C14.5384 20.4031 14.1293 20.2667 13.6521 20.2667Z");
    			attr(path1, "fill", "#A48F86");
    			attr(path1, "class", "svelte-rnei18");
    			attr(g, "clip-path", "url(#clip0_1554_302)");
    			attr(rect, "width", "27.2689");
    			attr(rect, "height", "27.2689");
    			attr(rect, "fill", "white");
    			attr(rect, "transform", "translate(0.165039 0.791992)");
    			attr(clipPath, "id", "clip0_1554_302");
    			attr(svg, "class", "modal_icon svelte-rnei18");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "viewBox", "0 0 28 29");
    			attr(svg, "fill", "none");
    			attr(button, "class", button_class_value = "clue " + /*custom*/ ctx[2] + " svelte-rnei18");
    			toggle_class(button, "is-disable-highlight", /*isDisableHighlight*/ ctx[6]);
    			toggle_class(button, "is-number-focused", /*isNumberFocused*/ ctx[4]);
    			toggle_class(button, "is-direction-focused", /*isDirectionFocused*/ ctx[5]);
    			toggle_class(button, "is-filled", /*isFilled*/ ctx[3]);
    			attr(li, "class", li_class_value = "" + (null_to_empty(/*clueClass*/ ctx[9]) + " svelte-rnei18"));
    		},
    		m(target, anchor) {
    			insert_hydration(target, li, anchor);
    			append_hydration(li, button);
    			append_hydration(button, svg);
    			append_hydration(svg, g);
    			append_hydration(g, path0);
    			append_hydration(g, path1);
    			append_hydration(svg, defs);
    			append_hydration(defs, clipPath);
    			append_hydration(clipPath, rect);
    			/*li_binding*/ ctx[15](li);

    			if (!mounted) {
    				dispose = [
    					listen(button, "click", /*click_handler*/ ctx[14]),
    					action_destroyer(scrollTo_action = scrollTO.call(null, li, /*isFocused*/ ctx[10])),
    					listen(li, "click", /*click_handler_1*/ ctx[16])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*custom*/ 4 && button_class_value !== (button_class_value = "clue " + /*custom*/ ctx[2] + " svelte-rnei18")) {
    				attr(button, "class", button_class_value);
    			}

    			if (dirty & /*custom, isDisableHighlight*/ 68) {
    				toggle_class(button, "is-disable-highlight", /*isDisableHighlight*/ ctx[6]);
    			}

    			if (dirty & /*custom, isNumberFocused*/ 20) {
    				toggle_class(button, "is-number-focused", /*isNumberFocused*/ ctx[4]);
    			}

    			if (dirty & /*custom, isDirectionFocused*/ 36) {
    				toggle_class(button, "is-direction-focused", /*isDirectionFocused*/ ctx[5]);
    			}

    			if (dirty & /*custom, isFilled*/ 12) {
    				toggle_class(button, "is-filled", /*isFilled*/ ctx[3]);
    			}

    			if (dirty & /*clueClass*/ 512 && li_class_value !== (li_class_value = "" + (null_to_empty(/*clueClass*/ ctx[9]) + " svelte-rnei18"))) {
    				attr(li, "class", li_class_value);
    			}

    			if (scrollTo_action && is_function(scrollTo_action.update) && dirty & /*isFocused*/ 1024) scrollTo_action.update.call(null, /*isFocused*/ ctx[10]);
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(li);
    			/*li_binding*/ ctx[15](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let isFocused;
    	let clueClass;
    	let { number } = $$props;
    	let { direction } = $$props;
    	let { clue } = $$props;
    	let { answer } = $$props;
    	let { custom } = $$props;
    	let { isFilled } = $$props;
    	let { isNumberFocused = false } = $$props;
    	let { isDirectionFocused = false } = $$props;
    	let { isDisableHighlight = false } = $$props;

    	let { onFocus = () => {
    		
    	} } = $$props;

    	let element;

    	function handleShare(params) {
    		const share__type = params.item.getAttribute("data-type");

    		setTimeout(
    			() => {
    				window.sessionStorage.setItem(`__jky_shared__${params.number}`, "true");
    				params.el.querySelector(".modal-content-body").innerHTML = createSocialDom(true, params.number);
    			},
    			4000
    		);

    		let _url = '';

    		switch (share__type) {
    			case 'facebook':
    				const _shared_fb_url = `${window.location.origin}/pages/crossword?utm_source=facebook&utm_medium=organic&utm_campaign=bfcm2023&utm_term=game`;
    				_url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(_shared_fb_url)}`;
    				handleCrosswordGTM({ position: answer, method: "Facebook" });
    				break;
    			case 'twitter':
    				const _shared_tw_url = `${window.location.origin}/pages/crossword?utm_source=twitter&utm_medium=organic&utm_campaign=bfcm2023&utm_term=game`;
    				_url = `https://twitter.com/intent/tweet?url=${encodeURIComponent(_shared_tw_url)}`;
    				handleCrosswordGTM({ position: answer, method: "Twitter" });
    				break;
    			case 'whatsapp':
    				const _shared_ws_url = `${window.location.origin}/pages/crossword?utm_source=whatsapp&utm_medium=organic&utm_campaign=bfcm2023&utm_term=game`;
    				_url = `https://api.whatsapp.com/send?url=${encodeURIComponent(_shared_ws_url)}`;
    				handleCrosswordGTM({ position: answer, method: "Whatsapp" });
    				break;
    			case 'messenger':
    				const _shared_ms_url = `${window.location.origin}/pages/crossword?utm_source=messenger&utm_medium=organic&utm_campaign=bfcm2023&utm_term=game`;
    				handleCrosswordGTM({ position: answer, method: "Messenger" });
    				FB.ui({
    					method: 'send',
    					link: _shared_ms_url,
    					redirect_uri: _shared_ms_url
    				});
    				return;
    			default:
    				return;
    		}

    		window.open(_url, '单独窗口', 'height=500,width=600,top=30,left=20,toolbar=no,menubar=no,scrollbars=no,resizable=no,location=no,status=no');
    	}

    	function createSocialDom(flag, num) {
    		const shareDom = `<h3 id="xxl" class="tips_modal__title">Need more hints?</h3>
    <div class="tips_modal__subtitle">Click the button below to share this game on social media and get the answers.</div>
    <ul class="tips_modal__socials">
      <li>
        <div data-url="https://www.jackery.com/pages/crossword?utm_source=facebook&utm_medium=organic&utm_campaign=bfcm2023&utm_term=game" data-type="facebook">
                <svg xmlns="http://www.w3.org/2000/svg" width="52" height="50" viewBox="0 0 52 50" fill="none">
          <path d="M48.44 0.755127H3.57691C2.49673 0.755127 1.6246 1.62064 1.6246 2.69478V47.3069C1.6246 48.3793 2.49673 49.2465 3.57517 49.2465H48.4383C49.5185 49.2465 50.3889 48.3793 50.3889 47.3069V2.69478C50.3889 1.62064 49.5185 0.755127 48.4383 0.755127H48.44ZM42.8068 14.9069H38.9126C35.8576 14.9069 35.2663 16.35 35.2663 18.4724V23.1448H42.5571L41.6052 30.462H35.2663V49.2465H27.6652V30.4655H21.3089V23.1431H27.6652V17.7482C27.6652 11.4879 31.5126 8.07582 37.1319 8.07582C39.8263 8.07582 42.1358 8.27409 42.8137 8.36547V14.9051H42.8068V14.9069Z" fill="#2477E1"/>
          </svg>
        </div>    
      </li>
      <li>
        <div data-url="/" data-type="twitter">
          <svg t="1698732095750" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2783" width="200" height="200"><path d="M281.6 281.6l188.8 249.6L281.6 736h41.6l166.4-179.2 134.4 179.2H768l-198.4-265.6 176-188.8H704l-153.6 163.2-121.6-163.2H281.6z m64 32h67.2L704 704h-64L345.6 313.6z" fill="#1D1D1B" p-id="2784"></path></svg>
        </div>  
      </li>  
      <li>
        <div data-url="/" data-type="whatsapp">
          <img src="https://cdn.shopify.com/s/files/1/0970/9262/files/02.png?v=1698829939" alt="whatsapp" />
        </div>
      </li>  

      <li class="hide__mobile">
        <div data-url="/" data-type="messenger">
          <img src="https://cdn.shopify.com/s/files/1/0970/9262/files/01_6b2bfacf-c07b-46db-922e-d8653d1aaa33.png?v=1698829939" alt="message" />
        </div>
      </li>  
    </ul>`;

    		const answerDom = `<h3 class="tips_modal__title">${tips[num - 1].title}</h3>
    <div class="tips_modal__des">${tips[num - 1].des}</div>
    `;

    		return flag ? answerDom : shareDom;
    	}

    	function handleOpenHelp(clue_name, number) {
    		const hasShared = window.sessionStorage.getItem(`__jky_shared__${number}`) || false;
    		const params = { number, clue_name };

    		Modal.getInstance(createSocialDom(hasShared, number), {
    			header: "",
    			id: `cell_modal_${clueClass}`,
    			class: "modal-container__crossword",
    			cb: el => {
    				if (hasShared) {
    					el.querySelector(".modal-content-body").innerHTML = createSocialDom(hasShared, number);
    				}

    				setTimeout(
    					() => {
    						el.querySelectorAll(".tips_modal__socials li>div").forEach(item => {
    							item.addEventListener("click", () => {
    								handleShare({ ...params, item, el });
    							});
    						});
    					},
    					0
    				);
    			}
    		});

    		handleCrosswordGTM({ position: answer });
    	}

    	const click_handler = () => {
    		handleOpenHelp(clue, number);
    	};

    	function li_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			element = $$value;
    			$$invalidate(8, element);
    		});
    	}

    	const click_handler_1 = () => {
    		onFocus();
    		handleOpenHelp(clue, number);
    	};

    	$$self.$$set = $$props => {
    		if ('number' in $$props) $$invalidate(0, number = $$props.number);
    		if ('direction' in $$props) $$invalidate(12, direction = $$props.direction);
    		if ('clue' in $$props) $$invalidate(1, clue = $$props.clue);
    		if ('answer' in $$props) $$invalidate(13, answer = $$props.answer);
    		if ('custom' in $$props) $$invalidate(2, custom = $$props.custom);
    		if ('isFilled' in $$props) $$invalidate(3, isFilled = $$props.isFilled);
    		if ('isNumberFocused' in $$props) $$invalidate(4, isNumberFocused = $$props.isNumberFocused);
    		if ('isDirectionFocused' in $$props) $$invalidate(5, isDirectionFocused = $$props.isDirectionFocused);
    		if ('isDisableHighlight' in $$props) $$invalidate(6, isDisableHighlight = $$props.isDisableHighlight);
    		if ('onFocus' in $$props) $$invalidate(7, onFocus = $$props.onFocus);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*isNumberFocused*/ 16) {
    			$$invalidate(10, isFocused = isNumberFocused);
    		}

    		if ($$self.$$.dirty & /*direction, number*/ 4097) {
    			$$invalidate(9, clueClass = `clue--${direction}--${number}`);
    		}
    	};

    	return [
    		number,
    		clue,
    		custom,
    		isFilled,
    		isNumberFocused,
    		isDirectionFocused,
    		isDisableHighlight,
    		onFocus,
    		element,
    		clueClass,
    		isFocused,
    		handleOpenHelp,
    		direction,
    		answer,
    		click_handler,
    		li_binding,
    		click_handler_1
    	];
    }

    class Clue extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {
    			number: 0,
    			direction: 12,
    			clue: 1,
    			answer: 13,
    			custom: 2,
    			isFilled: 3,
    			isNumberFocused: 4,
    			isDirectionFocused: 5,
    			isDisableHighlight: 6,
    			onFocus: 7
    		});
    	}
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\ClueList.svelte generated by Svelte v3.59.2 */

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[7] = list[i];
    	return child_ctx;
    }

    // (15:4) {#each clues as clue}
    function create_each_block$2(ctx) {
    	let clue;
    	let current;

    	function func() {
    		return /*func*/ ctx[6](/*clue*/ ctx[7]);
    	}

    	clue = new Clue({
    			props: {
    				clue: /*clue*/ ctx[7].clue,
    				answer: /*clue*/ ctx[7].answer,
    				number: /*clue*/ ctx[7].number,
    				direction: /*direction*/ ctx[0],
    				custom: /*clue*/ ctx[7].custom,
    				isFilled: /*clue*/ ctx[7].isFilled,
    				isNumberFocused: /*focusedClueNumbers*/ ctx[2][/*direction*/ ctx[0]] === /*clue*/ ctx[7].number,
    				isDirectionFocused: /*isDirectionFocused*/ ctx[3],
    				isDisableHighlight: /*isDisableHighlight*/ ctx[5],
    				onFocus: func
    			}
    		});

    	return {
    		c() {
    			create_component(clue.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(clue.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(clue, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const clue_changes = {};
    			if (dirty & /*clues*/ 2) clue_changes.clue = /*clue*/ ctx[7].clue;
    			if (dirty & /*clues*/ 2) clue_changes.answer = /*clue*/ ctx[7].answer;
    			if (dirty & /*clues*/ 2) clue_changes.number = /*clue*/ ctx[7].number;
    			if (dirty & /*direction*/ 1) clue_changes.direction = /*direction*/ ctx[0];
    			if (dirty & /*clues*/ 2) clue_changes.custom = /*clue*/ ctx[7].custom;
    			if (dirty & /*clues*/ 2) clue_changes.isFilled = /*clue*/ ctx[7].isFilled;
    			if (dirty & /*focusedClueNumbers, direction, clues*/ 7) clue_changes.isNumberFocused = /*focusedClueNumbers*/ ctx[2][/*direction*/ ctx[0]] === /*clue*/ ctx[7].number;
    			if (dirty & /*isDirectionFocused*/ 8) clue_changes.isDirectionFocused = /*isDirectionFocused*/ ctx[3];
    			if (dirty & /*isDisableHighlight*/ 32) clue_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[5];
    			if (dirty & /*onClueFocus, clues*/ 18) clue_changes.onFocus = func;
    			clue.$set(clue_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(clue.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(clue.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(clue, detaching);
    		}
    	};
    }

    function create_fragment$6(ctx) {
    	let p;
    	let t0;
    	let t1;
    	let div;
    	let ul;
    	let current;
    	let each_value = /*clues*/ ctx[1];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			p = element("p");
    			t0 = text(/*direction*/ ctx[0]);
    			t1 = space();
    			div = element("div");
    			ul = element("ul");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l(nodes) {
    			p = claim_element(nodes, "P", { class: true });
    			var p_nodes = children(p);
    			t0 = claim_text(p_nodes, /*direction*/ ctx[0]);
    			p_nodes.forEach(detach);
    			t1 = claim_space(nodes);
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			ul = claim_element(div_nodes, "UL", { class: true });
    			var ul_nodes = children(ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(ul_nodes);
    			}

    			ul_nodes.forEach(detach);
    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(p, "class", "svelte-1l0ulcd");
    			attr(ul, "class", "svelte-1l0ulcd");
    			attr(div, "class", "list svelte-1l0ulcd");
    		},
    		m(target, anchor) {
    			insert_hydration(target, p, anchor);
    			append_hydration(p, t0);
    			insert_hydration(target, t1, anchor);
    			insert_hydration(target, div, anchor);
    			append_hydration(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ul, null);
    				}
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*direction*/ 1) set_data(t0, /*direction*/ ctx[0]);

    			if (dirty & /*clues, direction, focusedClueNumbers, isDirectionFocused, isDisableHighlight, onClueFocus*/ 63) {
    				each_value = /*clues*/ ctx[1];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(ul, null);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(p);
    			if (detaching) detach(t1);
    			if (detaching) detach(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { direction } = $$props;
    	let { clues } = $$props;
    	let { focusedClueNumbers } = $$props;
    	let { isDirectionFocused } = $$props;
    	let { onClueFocus } = $$props;
    	let { isDisableHighlight } = $$props;
    	const func = clue => onClueFocus(clue);

    	$$self.$$set = $$props => {
    		if ('direction' in $$props) $$invalidate(0, direction = $$props.direction);
    		if ('clues' in $$props) $$invalidate(1, clues = $$props.clues);
    		if ('focusedClueNumbers' in $$props) $$invalidate(2, focusedClueNumbers = $$props.focusedClueNumbers);
    		if ('isDirectionFocused' in $$props) $$invalidate(3, isDirectionFocused = $$props.isDirectionFocused);
    		if ('onClueFocus' in $$props) $$invalidate(4, onClueFocus = $$props.onClueFocus);
    		if ('isDisableHighlight' in $$props) $$invalidate(5, isDisableHighlight = $$props.isDisableHighlight);
    	};

    	return [
    		direction,
    		clues,
    		focusedClueNumbers,
    		isDirectionFocused,
    		onClueFocus,
    		isDisableHighlight,
    		func
    	];
    }

    class ClueList extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			direction: 0,
    			clues: 1,
    			focusedClueNumbers: 2,
    			isDirectionFocused: 3,
    			onClueFocus: 4,
    			isDisableHighlight: 5
    		});
    	}
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Clues.svelte generated by Svelte v3.59.2 */

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[12] = list[i];
    	return child_ctx;
    }

    // (47:4) {#each ['across', 'down'] as direction}
    function create_each_block$1(ctx) {
    	let cluelist;
    	let current;

    	function func(...args) {
    		return /*func*/ ctx[10](/*direction*/ ctx[12], ...args);
    	}

    	cluelist = new ClueList({
    			props: {
    				direction: /*direction*/ ctx[12],
    				focusedClueNumbers: /*focusedClueNumbers*/ ctx[4],
    				clues: /*clues*/ ctx[1].filter(func),
    				isDirectionFocused: /*focusedDirection*/ ctx[0] === /*direction*/ ctx[12],
    				isDisableHighlight: /*isDisableHighlight*/ ctx[2],
    				onClueFocus: /*onClueFocus*/ ctx[5]
    			}
    		});

    	return {
    		c() {
    			create_component(cluelist.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(cluelist.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(cluelist, target, anchor);
    			current = true;
    		},
    		p(new_ctx, dirty) {
    			ctx = new_ctx;
    			const cluelist_changes = {};
    			if (dirty & /*focusedClueNumbers*/ 16) cluelist_changes.focusedClueNumbers = /*focusedClueNumbers*/ ctx[4];
    			if (dirty & /*clues*/ 2) cluelist_changes.clues = /*clues*/ ctx[1].filter(func);
    			if (dirty & /*focusedDirection*/ 1) cluelist_changes.isDirectionFocused = /*focusedDirection*/ ctx[0] === /*direction*/ ctx[12];
    			if (dirty & /*isDisableHighlight*/ 4) cluelist_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[2];
    			cluelist.$set(cluelist_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(cluelist.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(cluelist.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(cluelist, detaching);
    		}
    	};
    }

    function create_fragment$5(ctx) {
    	let section;
    	let div0;
    	let t;
    	let div1;
    	let current;
    	let each_value = ['across', 'down'];
    	let each_blocks = [];

    	for (let i = 0; i < 2; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	return {
    		c() {
    			section = element("section");
    			div0 = element("div");
    			t = space();
    			div1 = element("div");

    			for (let i = 0; i < 2; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l(nodes) {
    			section = claim_element(nodes, "SECTION", { class: true });
    			var section_nodes = children(section);
    			div0 = claim_element(section_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			div0_nodes.forEach(detach);
    			t = claim_space(section_nodes);
    			div1 = claim_element(section_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);

    			for (let i = 0; i < 2; i += 1) {
    				each_blocks[i].l(div1_nodes);
    			}

    			div1_nodes.forEach(detach);
    			section_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div0, "class", "clues--stacked svelte-1o7duub");
    			attr(div1, "class", "clues--list svelte-1o7duub");
    			attr(section, "class", "clues svelte-1o7duub");
    			toggle_class(section, "is-loaded", /*isLoaded*/ ctx[3]);
    		},
    		m(target, anchor) {
    			insert_hydration(target, section, anchor);
    			append_hydration(section, div0);
    			append_hydration(section, t);
    			append_hydration(section, div1);

    			for (let i = 0; i < 2; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div1, null);
    				}
    			}

    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*focusedClueNumbers, clues, focusedDirection, isDisableHighlight, onClueFocus*/ 55) {
    				each_value = ['across', 'down'];
    				let i;

    				for (i = 0; i < 2; i += 1) {
    					const child_ctx = get_each_context$1(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$1(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div1, null);
    					}
    				}

    				group_outros();

    				for (i = 2; i < 2; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if (!current || dirty & /*isLoaded*/ 8) {
    				toggle_class(section, "is-loaded", /*isLoaded*/ ctx[3]);
    			}
    		},
    		i(local) {
    			if (current) return;

    			for (let i = 0; i < 2; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < 2; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(section);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let focusedClueNumbers;
    	let { clues } = $$props;
    	let { cellIndexMap } = $$props;
    	let { focusedDirection } = $$props;
    	let { focusedCellIndex } = $$props;
    	let { focusedCell } = $$props;
    	let { stacked } = $$props;
    	let { isDisableHighlight } = $$props;
    	let { isLoaded } = $$props;

    	function onClueFocus({ direction, id, number }) {
    		// 避免当前cell被重置
    		if (focusedDirection === direction && focusedCell.clueNumbers[direction] === number) {
    			return;
    		}

    		$$invalidate(0, focusedDirection = direction);
    		$$invalidate(6, focusedCellIndex = cellIndexMap[id] || 0);
    	}

    	const func = (direction, d) => d.direction === direction;

    	$$self.$$set = $$props => {
    		if ('clues' in $$props) $$invalidate(1, clues = $$props.clues);
    		if ('cellIndexMap' in $$props) $$invalidate(7, cellIndexMap = $$props.cellIndexMap);
    		if ('focusedDirection' in $$props) $$invalidate(0, focusedDirection = $$props.focusedDirection);
    		if ('focusedCellIndex' in $$props) $$invalidate(6, focusedCellIndex = $$props.focusedCellIndex);
    		if ('focusedCell' in $$props) $$invalidate(8, focusedCell = $$props.focusedCell);
    		if ('stacked' in $$props) $$invalidate(9, stacked = $$props.stacked);
    		if ('isDisableHighlight' in $$props) $$invalidate(2, isDisableHighlight = $$props.isDisableHighlight);
    		if ('isLoaded' in $$props) $$invalidate(3, isLoaded = $$props.isLoaded);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*focusedCell*/ 256) {
    			$$invalidate(4, focusedClueNumbers = focusedCell.clueNumbers || {});
    		}

    		if ($$self.$$.dirty & /*clues, focusedDirection, focusedClueNumbers*/ 19) {
    			clues.find(c => c.direction === focusedDirection && c.number === focusedClueNumbers[focusedDirection]) || {};
    		}
    	};

    	return [
    		focusedDirection,
    		clues,
    		isDisableHighlight,
    		isLoaded,
    		focusedClueNumbers,
    		onClueFocus,
    		focusedCellIndex,
    		cellIndexMap,
    		focusedCell,
    		stacked,
    		func
    	];
    }

    class Clues extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$5, create_fragment$5, safe_not_equal, {
    			clues: 1,
    			cellIndexMap: 7,
    			focusedDirection: 0,
    			focusedCellIndex: 6,
    			focusedCell: 8,
    			stacked: 9,
    			isDisableHighlight: 2,
    			isLoaded: 3
    		});
    	}
    }

    function quadIn(t) {
        return t * t;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity } = {}) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Confetti.svelte generated by Svelte v3.59.2 */

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[8] = list[i][0];
    	child_ctx[9] = list[i][1];
    	child_ctx[10] = list[i][2];
    	child_ctx[12] = i;
    	return child_ctx;
    }

    // (45:2) {#each allElements as [element, color, scale], i}
    function create_each_block(ctx) {
    	let g1;
    	let g0;
    	let raw_value = /*element*/ ctx[8] + "";
    	let g0_style_value;

    	return {
    		c() {
    			g1 = svg_element("g");
    			g0 = svg_element("g");
    			this.h();
    		},
    		l(nodes) {
    			g1 = claim_svg_element(nodes, "g", { style: true, class: true });
    			var g1_nodes = children(g1);
    			g0 = claim_svg_element(g1_nodes, "g", { fill: true, style: true, class: true });
    			var g0_nodes = children(g0);
    			g0_nodes.forEach(detach);
    			g1_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(g0, "fill", /*color*/ ctx[9]);

    			attr(g0, "style", g0_style_value = [
    				`--rotation: ${Math.random() * 360}deg`,
    				`animation-delay: ${quadIn(/*i*/ ctx[12] / /*numberOfElements*/ ctx[0])}s`,
    				`animation-duration: ${/*durationInSeconds*/ ctx[1] * /*randomNumber*/ ctx[2](0.7, 1)}s`
    			].join(';'));

    			attr(g0, "class", "svelte-15wt7c8");
    			set_style(g1, "transform", "scale(" + /*scale*/ ctx[10] + ")");
    			attr(g1, "class", "svelte-15wt7c8");
    		},
    		m(target, anchor) {
    			insert_hydration(target, g1, anchor);
    			append_hydration(g1, g0);
    			g0.innerHTML = raw_value;
    		},
    		p(ctx, dirty) {
    			if (dirty & /*numberOfElements, durationInSeconds*/ 3 && g0_style_value !== (g0_style_value = [
    				`--rotation: ${Math.random() * 360}deg`,
    				`animation-delay: ${quadIn(/*i*/ ctx[12] / /*numberOfElements*/ ctx[0])}s`,
    				`animation-duration: ${/*durationInSeconds*/ ctx[1] * /*randomNumber*/ ctx[2](0.7, 1)}s`
    			].join(';'))) {
    				attr(g0, "style", g0_style_value);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(g1);
    		}
    	};
    }

    function create_fragment$4(ctx) {
    	let svg;
    	let each_value = /*allElements*/ ctx[3];
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	return {
    		c() {
    			svg = svg_element("svg");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l(nodes) {
    			svg = claim_svg_element(nodes, "svg", { class: true, viewBox: true });
    			var svg_nodes = children(svg);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(svg_nodes);
    			}

    			svg_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(svg, "class", "confetti svelte-15wt7c8");
    			attr(svg, "viewBox", "-10 -10 10 10");
    		},
    		m(target, anchor) {
    			insert_hydration(target, svg, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(svg, null);
    				}
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*allElements, Math, quadIn, numberOfElements, durationInSeconds, randomNumber*/ 15) {
    				each_value = /*allElements*/ ctx[3];
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(svg, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(svg);
    			destroy_each(each_blocks, detaching);
    		}
    	};
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { numberOfElements = 50 } = $$props;
    	let { durationInSeconds = 2 } = $$props;

    	let { colors = [
    		"#fff",
    		"#c7ecee",
    		"#778beb",
    		"#f7d794",
    		"#63cdda",
    		"#cf6a87",
    		"#e77f67",
    		"#786fa6",
    		"#FDA7DF",
    		"#4b7bec",
    		"#475c83"
    	] } = $$props;

    	const pickFrom = arr => arr[Math.round(Math.random() * arr.length)];
    	const randomNumber = (min, max) => Math.random() * (max - min) + min;
    	const getManyOf = str => new Array(30).fill(0).map(() => str);

    	const elementOptions = [
    		...getManyOf(`<circle r="3" />`),
    		...getManyOf(`<path d="M3.83733 4.73234C4.38961 4.73234 4.83733 4.28463 4.83733 3.73234C4.83733 3.18006 4.38961 2.73234 3.83733 2.73234C3.28505 2.73234 2.83733 3.18006 2.83733 3.73234C2.83733 4.28463 3.28505 4.73234 3.83733 4.73234ZM3.83733 6.73234C5.49418 6.73234 6.83733 5.38919 6.83733 3.73234C6.83733 2.07549 5.49418 0.732341 3.83733 0.732341C2.18048 0.732341 0.83733 2.07549 0.83733 3.73234C0.83733 5.38919 2.18048 6.73234 3.83733 6.73234Z" />`),
    		...getManyOf(`<path d="M4.29742 2.26041C3.86864 2.1688 3.20695 2.21855 2.13614 3.0038C1.69078 3.33041 1.06498 3.23413 0.738375 2.78876C0.411774 2.3434 0.508051 1.7176 0.953417 1.39099C2.32237 0.387097 3.55827 0.0573281 4.71534 0.304565C5.80081 0.536504 6.61625 1.24716 7.20541 1.78276C7.28295 1.85326 7.35618 1.92051 7.4263 1.9849C7.64841 2.18888 7.83929 2.36418 8.03729 2.52315C8.29108 2.72692 8.48631 2.8439 8.64952 2.90181C8.7915 2.95219 8.91895 2.96216 9.07414 2.92095C9.24752 2.8749 9.5134 2.7484 9.88467 2.42214C10.2995 2.05757 10.9314 2.09833 11.2959 2.51319C11.6605 2.92805 11.6198 3.5599 11.2049 3.92447C10.6816 4.38435 10.1478 4.70514 9.58752 4.85394C9.00909 5.00756 8.469 4.95993 7.9807 4.78667C7.51364 4.62093 7.11587 4.34823 6.78514 4.08268C6.53001 3.87783 6.27248 3.64113 6.04114 3.4285C5.97868 3.37109 5.91814 3.31544 5.86006 3.26264C5.25645 2.7139 4.79779 2.36733 4.29742 2.26041Z" />`),
    		...getManyOf(`<rect width="4" height="4" x="-2" y="-2" />`),
    		`<path d="M -5 5 L 0 -5 L 5 5 Z" />`,
    		...("ABCDEFGHIJKLMNOPQRSTUVWXYZ").split("").map(letter => `<text style="font-weight: 700">${letter}</text>`)
    	];

    	const allElements = new Array(numberOfElements).fill(0).map((_, i) => [pickFrom(elementOptions), pickFrom(colors), Math.random()]);

    	$$self.$$set = $$props => {
    		if ('numberOfElements' in $$props) $$invalidate(0, numberOfElements = $$props.numberOfElements);
    		if ('durationInSeconds' in $$props) $$invalidate(1, durationInSeconds = $$props.durationInSeconds);
    		if ('colors' in $$props) $$invalidate(4, colors = $$props.colors);
    	};

    	return [numberOfElements, durationInSeconds, randomNumber, allElements, colors];
    }

    class Confetti extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			numberOfElements: 0,
    			durationInSeconds: 1,
    			colors: 4
    		});
    	}
    }

    function fromPairs(arr) {
      let res = {};
      arr.forEach((d) => {
        res[d[0]] = d[1];
      });
      return res;
    }
    /**
     * click copy
     *
     * @param {Element} value - copy string
     * @param {Element} cb - callback function
     */
    const copyString = (value, cb) => {
      const textarea = document.createElement('textarea');
      textarea.readOnly = 'readonly';
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      const result = document.execCommand('Copy');
      document.body.removeChild(textarea);
      if (result && cb) { cb(); }
    };

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\CompletedMessage.svelte generated by Svelte v3.59.2 */
    const get_footer_slot_changes$1 = dirty => ({});
    const get_footer_slot_context$1 = ctx => ({});
    const get_message_slot_changes$1 = dirty => ({});
    const get_message_slot_context$1 = ctx => ({});

    // (51:0) {#if isOpen}
    function create_if_block$1(ctx) {
    	let div3;
    	let t0;
    	let div1;
    	let div0;
    	let t1;
    	let t2;
    	let div2;
    	let t3;
    	let div3_transition;
    	let t4;
    	let div4;
    	let div4_transition;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*showCloseBtn*/ ctx[2] && create_if_block_5$1(ctx);
    	const message_slot_template = /*#slots*/ ctx[12].message;
    	const message_slot = create_slot(message_slot_template, ctx, /*$$scope*/ ctx[11], get_message_slot_context$1);
    	let if_block1 = /*showConfetti*/ ctx[0] && create_if_block_2$1(ctx);
    	const footer_slot_template = /*#slots*/ ctx[12].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[11], get_footer_slot_context$1);
    	let if_block2 = /*showConfetti*/ ctx[0] && create_if_block_1$1();

    	return {
    		c() {
    			div3 = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			div1 = element("div");
    			div0 = element("div");
    			if (message_slot) message_slot.c();
    			t1 = space();
    			if (if_block1) if_block1.c();
    			t2 = space();
    			div2 = element("div");
    			if (footer_slot) footer_slot.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			div4 = element("div");
    			this.h();
    		},
    		l(nodes) {
    			div3 = claim_element(nodes, "DIV", { class: true });
    			var div3_nodes = children(div3);
    			if (if_block0) if_block0.l(div3_nodes);
    			t0 = claim_space(div3_nodes);
    			div1 = claim_element(div3_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			div0 = claim_element(div1_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			if (message_slot) message_slot.l(div0_nodes);
    			div0_nodes.forEach(detach);
    			t1 = claim_space(div1_nodes);
    			if (if_block1) if_block1.l(div1_nodes);
    			div1_nodes.forEach(detach);
    			t2 = claim_space(div3_nodes);
    			div2 = claim_element(div3_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			if (footer_slot) footer_slot.l(div2_nodes);
    			div2_nodes.forEach(detach);
    			t3 = claim_space(div3_nodes);
    			if (if_block2) if_block2.l(div3_nodes);
    			div3_nodes.forEach(detach);
    			t4 = claim_space(nodes);
    			div4 = claim_element(nodes, "DIV", { class: true });
    			children(div4).forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div0, "class", "message svelte-83cmws");
    			attr(div1, "class", "content svelte-83cmws");
    			attr(div2, "class", "footer");
    			attr(div3, "class", "completed svelte-83cmws");
    			toggle_class(div3, "issubscribeModal", /*subscribeModal*/ ctx[4]);
    			attr(div4, "class", "curtain 888 svelte-83cmws");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div3, anchor);
    			if (if_block0) if_block0.m(div3, null);
    			append_hydration(div3, t0);
    			append_hydration(div3, div1);
    			append_hydration(div1, div0);

    			if (message_slot) {
    				message_slot.m(div0, null);
    			}

    			append_hydration(div1, t1);
    			if (if_block1) if_block1.m(div1, null);
    			append_hydration(div3, t2);
    			append_hydration(div3, div2);

    			if (footer_slot) {
    				footer_slot.m(div2, null);
    			}

    			append_hydration(div3, t3);
    			if (if_block2) if_block2.m(div3, null);
    			insert_hydration(target, t4, anchor);
    			insert_hydration(target, div4, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen(div4, "click", /*click_handler*/ ctx[13]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*showCloseBtn*/ ctx[2]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_5$1(ctx);
    					if_block0.c();
    					if_block0.m(div3, t0);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (message_slot) {
    				if (message_slot.p && (!current || dirty & /*$$scope*/ 2048)) {
    					update_slot_base(
    						message_slot,
    						message_slot_template,
    						ctx,
    						/*$$scope*/ ctx[11],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[11])
    						: get_slot_changes(message_slot_template, /*$$scope*/ ctx[11], dirty, get_message_slot_changes$1),
    						get_message_slot_context$1
    					);
    				}
    			}

    			if (/*showConfetti*/ ctx[0]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_2$1(ctx);
    					if_block1.c();
    					if_block1.m(div1, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (footer_slot) {
    				if (footer_slot.p && (!current || dirty & /*$$scope*/ 2048)) {
    					update_slot_base(
    						footer_slot,
    						footer_slot_template,
    						ctx,
    						/*$$scope*/ ctx[11],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[11])
    						: get_slot_changes(footer_slot_template, /*$$scope*/ ctx[11], dirty, get_footer_slot_changes$1),
    						get_footer_slot_context$1
    					);
    				}
    			}

    			if (/*showConfetti*/ ctx[0]) {
    				if (if_block2) {
    					if (dirty & /*showConfetti*/ 1) {
    						transition_in(if_block2, 1);
    					}
    				} else {
    					if_block2 = create_if_block_1$1();
    					if_block2.c();
    					transition_in(if_block2, 1);
    					if_block2.m(div3, null);
    				}
    			} else if (if_block2) {
    				group_outros();

    				transition_out(if_block2, 1, 1, () => {
    					if_block2 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty & /*subscribeModal*/ 16) {
    				toggle_class(div3, "issubscribeModal", /*subscribeModal*/ ctx[4]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(message_slot, local);
    			transition_in(footer_slot, local);
    			transition_in(if_block2);

    			add_render_callback(() => {
    				if (!current) return;
    				if (!div3_transition) div3_transition = create_bidirectional_transition(div3, fade, { y: 20 }, true);
    				div3_transition.run(1);
    			});

    			add_render_callback(() => {
    				if (!current) return;
    				if (!div4_transition) div4_transition = create_bidirectional_transition(div4, fade, { duration: 250 }, true);
    				div4_transition.run(1);
    			});

    			current = true;
    		},
    		o(local) {
    			transition_out(message_slot, local);
    			transition_out(footer_slot, local);
    			transition_out(if_block2);
    			if (!div3_transition) div3_transition = create_bidirectional_transition(div3, fade, { y: 20 }, false);
    			div3_transition.run(0);
    			if (!div4_transition) div4_transition = create_bidirectional_transition(div4, fade, { duration: 250 }, false);
    			div4_transition.run(0);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div3);
    			if (if_block0) if_block0.d();
    			if (message_slot) message_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			if (footer_slot) footer_slot.d(detaching);
    			if (if_block2) if_block2.d();
    			if (detaching && div3_transition) div3_transition.end();
    			if (detaching) detach(t4);
    			if (detaching) detach(div4);
    			if (detaching && div4_transition) div4_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (57:4) {#if showCloseBtn}
    function create_if_block_5$1(ctx) {
    	let svg;
    	let path;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			svg = svg_element("svg");
    			path = svg_element("path");
    			this.h();
    		},
    		l(nodes) {
    			svg = claim_svg_element(nodes, "svg", {
    				class: true,
    				"fill-rule": true,
    				viewBox: true,
    				focusable: true,
    				"data-icon": true,
    				width: true,
    				height: true,
    				fill: true,
    				"aria-hidden": true
    			});

    			var svg_nodes = children(svg);
    			path = claim_svg_element(svg_nodes, "path", { d: true });
    			children(path).forEach(detach);
    			svg_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(path, "d", "M799.86 166.31c.02 0 .04.02.08.06l57.69 57.7c.04.03.05.05.06.08a.12.12 0 010 .06c0 .03-.02.05-.06.09L569.93 512l287.7 287.7c.04.04.05.06.06.09a.12.12 0 010 .07c0 .02-.02.04-.06.08l-57.7 57.69c-.03.04-.05.05-.07.06a.12.12 0 01-.07 0c-.03 0-.05-.02-.09-.06L512 569.93l-287.7 287.7c-.04.04-.06.05-.09.06a.12.12 0 01-.07 0c-.02 0-.04-.02-.08-.06l-57.69-57.7c-.04-.03-.05-.05-.06-.07a.12.12 0 010-.07c0-.03.02-.05.06-.09L454.07 512l-287.7-287.7c-.04-.04-.05-.06-.06-.09a.12.12 0 010-.07c0-.02.02-.04.06-.08l57.7-57.69c.03-.04.05-.05.07-.06a.12.12 0 01.07 0c.03 0 .05.02.09.06L512 454.07l287.7-287.7c.04-.04.06-.05.09-.06a.12.12 0 01.07 0z");
    			attr(svg, "class", "close_icon svelte-83cmws");
    			attr(svg, "fill-rule", "evenodd");
    			attr(svg, "viewBox", "64 64 896 896");
    			attr(svg, "focusable", "false");
    			attr(svg, "data-icon", "close");
    			attr(svg, "width", "1em");
    			attr(svg, "height", "1em");
    			attr(svg, "fill", "currentColor");
    			attr(svg, "aria-hidden", "true");
    		},
    		m(target, anchor) {
    			insert_hydration(target, svg, anchor);
    			append_hydration(svg, path);

    			if (!mounted) {
    				dispose = listen(svg, "click", /*close*/ ctx[6]);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d(detaching) {
    			if (detaching) detach(svg);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (66:6) {#if showConfetti}
    function create_if_block_2$1(ctx) {
    	let button;
    	let t;
    	let mounted;
    	let dispose;
    	let if_block0 = /*btnShopNow*/ ctx[1] && create_if_block_4$1(ctx);
    	let if_block1 = !/*btnShopNow*/ ctx[1] && create_if_block_3$1();

    	return {
    		c() {
    			button = element("button");
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			this.h();
    		},
    		l(nodes) {
    			button = claim_element(nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);
    			if (if_block0) if_block0.l(button_nodes);
    			t = claim_space(button_nodes);
    			if (if_block1) if_block1.l(button_nodes);
    			button_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(button, "class", "svelte-83cmws");
    		},
    		m(target, anchor) {
    			insert_hydration(target, button, anchor);
    			if (if_block0) if_block0.m(button, null);
    			append_hydration(button, t);
    			if (if_block1) if_block1.m(button, null);

    			if (!mounted) {
    				dispose = listen(button, "click", /*close*/ ctx[6]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (/*btnShopNow*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_4$1(ctx);
    					if_block0.c();
    					if_block0.m(button, t);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (!/*btnShopNow*/ ctx[1]) {
    				if (if_block1) ; else {
    					if_block1 = create_if_block_3$1();
    					if_block1.c();
    					if_block1.m(button, null);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(button);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (68:10) {#if btnShopNow}
    function create_if_block_4$1(ctx) {
    	let span;
    	let t;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			span = element("span");
    			t = text(/*success_copy*/ ctx[3]);
    			this.h();
    		},
    		l(nodes) {
    			span = claim_element(nodes, "SPAN", { class: true });
    			var span_nodes = children(span);
    			t = claim_text(span_nodes, /*success_copy*/ ctx[3]);
    			span_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(span, "class", "svelte-83cmws");
    		},
    		m(target, anchor) {
    			insert_hydration(target, span, anchor);
    			append_hydration(span, t);

    			if (!mounted) {
    				dispose = listen(span, "click", /*handleGTM_shopnow*/ ctx[7]);
    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty & /*success_copy*/ 8) set_data(t, /*success_copy*/ ctx[3]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    // (73:10) {#if !btnShopNow}
    function create_if_block_3$1(ctx) {
    	let t;

    	return {
    		c() {
    			t = text("CLOSE");
    		},
    		l(nodes) {
    			t = claim_text(nodes, "CLOSE");
    		},
    		m(target, anchor) {
    			insert_hydration(target, t, anchor);
    		},
    		d(detaching) {
    			if (detaching) detach(t);
    		}
    	};
    }

    // (84:4) {#if showConfetti}
    function create_if_block_1$1(ctx) {
    	let div;
    	let confetti;
    	let current;
    	confetti = new Confetti({});

    	return {
    		c() {
    			div = element("div");
    			create_component(confetti.$$.fragment);
    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			claim_component(confetti.$$.fragment, div_nodes);
    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "confetti svelte-83cmws");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);
    			mount_component(confetti, div, null);
    			current = true;
    		},
    		i(local) {
    			if (current) return;
    			transition_in(confetti.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(confetti.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			destroy_component(confetti);
    		}
    	};
    }

    function create_fragment$3(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*isOpen*/ ctx[5] && create_if_block$1(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			if (/*isOpen*/ ctx[5]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*isOpen*/ 32) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$1(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	const dispatch = createEventDispatcher();
    	let { showConfetti = true } = $$props;
    	let { outClickClose = true } = $$props;
    	let { funcClose = false } = $$props;
    	let { btnShopNow = true } = $$props;
    	let { showCloseBtn = false } = $$props;
    	let { success_copy } = $$props;
    	let { shopurl } = $$props;
    	let { subscribeModal = false } = $$props;
    	let isOpen = true;

    	function close() {
    		if (outClickClose) {
    			$$invalidate(5, isOpen = false);
    		}

    		dispatch('messageClose', false);
    	}

    	function handleGTM_shopnow() {
    		const code = document.querySelector(".coupone_info .coupone_info_title").innerText.replace("CODE:", "") || "";
    		copyString(code.trim());
    		handleGameGTM({ button_name: success_copy });

    		setTimeout(
    			() => {
    				window.location.href = shopurl;
    			},
    			20
    		);
    	}

    	onMount(async () => {
    		setTimeout(
    			() => {
    				document.querySelector(".confetti").style.display = "none";
    			},
    			1200
    		);
    	});

    	const click_handler = e => {
    		e.stopPropagation();
    		e.preventDefault();
    		close();
    	};

    	$$self.$$set = $$props => {
    		if ('showConfetti' in $$props) $$invalidate(0, showConfetti = $$props.showConfetti);
    		if ('outClickClose' in $$props) $$invalidate(8, outClickClose = $$props.outClickClose);
    		if ('funcClose' in $$props) $$invalidate(9, funcClose = $$props.funcClose);
    		if ('btnShopNow' in $$props) $$invalidate(1, btnShopNow = $$props.btnShopNow);
    		if ('showCloseBtn' in $$props) $$invalidate(2, showCloseBtn = $$props.showCloseBtn);
    		if ('success_copy' in $$props) $$invalidate(3, success_copy = $$props.success_copy);
    		if ('shopurl' in $$props) $$invalidate(10, shopurl = $$props.shopurl);
    		if ('subscribeModal' in $$props) $$invalidate(4, subscribeModal = $$props.subscribeModal);
    		if ('$$scope' in $$props) $$invalidate(11, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*funcClose*/ 512) {
    			funcClose && $$invalidate(5, isOpen = false);
    		}
    	};

    	return [
    		showConfetti,
    		btnShopNow,
    		showCloseBtn,
    		success_copy,
    		subscribeModal,
    		isOpen,
    		close,
    		handleGTM_shopnow,
    		outClickClose,
    		funcClose,
    		shopurl,
    		$$scope,
    		slots,
    		click_handler
    	];
    }

    class CompletedMessage extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			showConfetti: 0,
    			outClickClose: 8,
    			funcClose: 9,
    			btnShopNow: 1,
    			showCloseBtn: 2,
    			success_copy: 3,
    			shopurl: 10,
    			subscribeModal: 4
    		});
    	}
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\CheckModal.svelte generated by Svelte v3.59.2 */

    function create_fragment$2(ctx) {
    	let div2;
    	let div1;
    	let div0;
    	let button0;
    	let t0;
    	let t1;
    	let p0;
    	let t2;
    	let t3;
    	let t4;
    	let t5;
    	let p1;
    	let t6;
    	let t7;
    	let t8;
    	let t9;
    	let button1;
    	let t10;
    	let mounted;
    	let dispose;

    	return {
    		c() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			t0 = text("close");
    			t1 = space();
    			p0 = element("p");
    			t2 = text(/*modal_correct_words*/ ctx[2]);
    			t3 = space();
    			t4 = text(/*correct_num*/ ctx[0]);
    			t5 = space();
    			p1 = element("p");
    			t6 = text(/*modal_incorrect_words*/ ctx[3]);
    			t7 = space();
    			t8 = text(/*error_num*/ ctx[1]);
    			t9 = space();
    			button1 = element("button");
    			t10 = text("open");
    			this.h();
    		},
    		l(nodes) {
    			div2 = claim_element(nodes, "DIV", { id: true, class: true });
    			var div2_nodes = children(div2);
    			div1 = claim_element(div2_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			div0 = claim_element(div1_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
    			var button0_nodes = children(button0);
    			t0 = claim_text(button0_nodes, "close");
    			button0_nodes.forEach(detach);
    			t1 = claim_space(div0_nodes);
    			p0 = claim_element(div0_nodes, "P", { class: true });
    			var p0_nodes = children(p0);
    			t2 = claim_text(p0_nodes, /*modal_correct_words*/ ctx[2]);
    			t3 = claim_space(p0_nodes);
    			t4 = claim_text(p0_nodes, /*correct_num*/ ctx[0]);
    			p0_nodes.forEach(detach);
    			t5 = claim_space(div0_nodes);
    			p1 = claim_element(div0_nodes, "P", { class: true });
    			var p1_nodes = children(p1);
    			t6 = claim_text(p1_nodes, /*modal_incorrect_words*/ ctx[3]);
    			t7 = claim_space(p1_nodes);
    			t8 = claim_text(p1_nodes, /*error_num*/ ctx[1]);
    			p1_nodes.forEach(detach);
    			div0_nodes.forEach(detach);
    			div1_nodes.forEach(detach);
    			div2_nodes.forEach(detach);
    			t9 = claim_space(nodes);
    			button1 = claim_element(nodes, "BUTTON", { class: true });
    			var button1_nodes = children(button1);
    			t10 = claim_text(button1_nodes, "open");
    			button1_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(button0, "class", "check__close svelte-1oqir1l");
    			attr(p0, "class", "correct_text svelte-1oqir1l");
    			attr(p1, "class", "incorrect_text svelte-1oqir1l");
    			attr(div0, "class", "modal svelte-1oqir1l");
    			attr(div1, "class", "modal-background svelte-1oqir1l");
    			attr(div2, "id", "modal-container");
    			attr(div2, "class", "svelte-1oqir1l");
    			toggle_class(div2, "five", /*modalIn*/ ctx[4]);
    			toggle_class(div2, "out", /*out*/ ctx[5]);
    			attr(button1, "class", "check__open svelte-1oqir1l");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div2, anchor);
    			append_hydration(div2, div1);
    			append_hydration(div1, div0);
    			append_hydration(div0, button0);
    			append_hydration(button0, t0);
    			append_hydration(div0, t1);
    			append_hydration(div0, p0);
    			append_hydration(p0, t2);
    			append_hydration(p0, t3);
    			append_hydration(p0, t4);
    			append_hydration(div0, t5);
    			append_hydration(div0, p1);
    			append_hydration(p1, t6);
    			append_hydration(p1, t7);
    			append_hydration(p1, t8);
    			insert_hydration(target, t9, anchor);
    			insert_hydration(target, button1, anchor);
    			append_hydration(button1, t10);

    			if (!mounted) {
    				dispose = [
    					listen(button0, "click", /*closeModal*/ ctx[7]),
    					listen(button1, "click", /*openModal*/ ctx[6])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*modal_correct_words*/ 4) set_data(t2, /*modal_correct_words*/ ctx[2]);
    			if (dirty & /*correct_num*/ 1) set_data(t4, /*correct_num*/ ctx[0]);
    			if (dirty & /*modal_incorrect_words*/ 8) set_data(t6, /*modal_incorrect_words*/ ctx[3]);
    			if (dirty & /*error_num*/ 2) set_data(t8, /*error_num*/ ctx[1]);

    			if (dirty & /*modalIn*/ 16) {
    				toggle_class(div2, "five", /*modalIn*/ ctx[4]);
    			}

    			if (dirty & /*out*/ 32) {
    				toggle_class(div2, "out", /*out*/ ctx[5]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div2);
    			if (detaching) detach(t9);
    			if (detaching) detach(button1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { open = false } = $$props;
    	let { correct_num = 0 } = $$props;
    	let { error_num = 0 } = $$props;
    	let { modal_correct_words = "CORRECT WORDS: " } = $$props;
    	let { modal_incorrect_words = "INCORRECT WORDS: " } = $$props;
    	let modalIn = false;
    	let out = false;

    	function openModal() {
    		$$invalidate(4, modalIn = true);
    		$$invalidate(5, out = false);
    		dispatch('checkModalEvent', true);
    	}

    	function closeModal() {
    		$$invalidate(5, out = true);
    		dispatch('checkModalEvent', false);
    	}

    	$$self.$$set = $$props => {
    		if ('open' in $$props) $$invalidate(8, open = $$props.open);
    		if ('correct_num' in $$props) $$invalidate(0, correct_num = $$props.correct_num);
    		if ('error_num' in $$props) $$invalidate(1, error_num = $$props.error_num);
    		if ('modal_correct_words' in $$props) $$invalidate(2, modal_correct_words = $$props.modal_correct_words);
    		if ('modal_incorrect_words' in $$props) $$invalidate(3, modal_incorrect_words = $$props.modal_incorrect_words);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*open*/ 256) {
    			open && openModal();
    		}

    		if ($$self.$$.dirty & /*open*/ 256) {
    			!open && closeModal();
    		}
    	};

    	return [
    		correct_num,
    		error_num,
    		modal_correct_words,
    		modal_incorrect_words,
    		modalIn,
    		out,
    		openModal,
    		closeModal,
    		open
    	];
    }

    class CheckModal extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance$2, create_fragment$2, safe_not_equal, {
    			open: 8,
    			correct_num: 0,
    			error_num: 1,
    			modal_correct_words: 2,
    			modal_incorrect_words: 3
    		});
    	}
    }

    let BASE_URL = '';
    let CR = '';

    // 生产环境 接口域名
    const prodUrl = "https://api.myjackery.com";
    const awsProdUrl = "https://aws-gateway.hijackery.cn";
    // uat环境 接口域名
    const uatUrl = "https://api-uat.myjackery.com";
    const awsUatUrl = "https://aws-gateway-uat.hijackery.cn";
    // 开发环境 接口域名
    const devUrl = "https://demo-api.myjackery.com";
    const awsDevUrl = "https://10.1.74.145:8093";

    if(!window.shopId) {
        window.shopId = '55005249633';
    }
    switch (window.shopId) {
      case "9709262": CR = "US"; BASE_URL = prodUrl; break;
      case "60738666677": CR = "CA"; BASE_URL = prodUrl; break;
      case "10015375438": CR = "JP"; BASE_URL = prodUrl; break;
      case "56981160124": CR = "GB"; BASE_URL = prodUrl; break;
      case "57272172741": CR = "DE"; BASE_URL = prodUrl; break;
      case "60455780502": CR = "KR"; BASE_URL = prodUrl; break;
      case "68984701213": CR = "AU"; BASE_URL = prodUrl; break;
      case "69511053598": CR = "FR"; BASE_URL = prodUrl; break;
      case "69224431898": CR = "IT"; BASE_URL = prodUrl; break;
      case "69013700929": CR = "ES"; BASE_URL = prodUrl; break;
      case "73356443969": CR = "EU"; BASE_URL = prodUrl; break;
      case "74688758050": CR = "HK"; BASE_URL = prodUrl; break;
      case "74914496810": CR = "MO"; BASE_URL = prodUrl; break;
      case "79611232554": CR = "US"; BASE_URL = uatUrl; break;
      
      default: CR = "US"; BASE_URL = devUrl; break;
    }

    const lang = document.querySelector("html").getAttribute("lang") || "";

    const initial = {
      method: 'GET', params: null, body: null, cache: 'no-cache', credentials: 'include', responseType: 'JSON', mode: 'cors',
      headers: {
        cr: CR,
        lang
      }
    };

    function request(url, config, settings) {
      if (window.Shopify && window.Shopify.theme.role === "unpublished") {
        BASE_URL === prodUrl && (BASE_URL = uatUrl);
      }

      // riben ces 
      if(window.shopId === '10015375438') {
        BASE_URL = prodUrl;
      }

      if (settings && settings.type == 'it-java') {
        BASE_URL = BASE_URL === prodUrl || BASE_URL === awsProdUrl ? awsProdUrl : BASE_URL === uatUrl || BASE_URL === awsUatUrl ? awsUatUrl : awsDevUrl;
      } else {
        BASE_URL = BASE_URL === prodUrl || BASE_URL === awsProdUrl ? prodUrl : BASE_URL === uatUrl || BASE_URL === awsUatUrl ? uatUrl : devUrl;
      }


      // init params
      if (typeof url !== 'string') throw new TypeError('url must be required and of string type');
      if (config && config.constructor === Object) {
        config = Object.assign(initial, config);
      } else {
        config = initial;
      }
      let { method, params, body, headers, cache, credentials, responseType, check_jackery_token, } = config;

      // 处理URL：请求前缀 & 问号参数
      if (!/^http(s?):\/\//i.test(url)) { url = BASE_URL + url; }
      if (params != null) {
        if (params.constructor === Object) {
          const values = Object.values(params);
          const keys = Object.keys(params);
          const arr = [];
          for (let i = 0; i < values.length; i++) {
            arr.push(`${keys[i]}=${values[i]}`);
          }
          params = arr.join("&");
        }
        url += `${url.includes('?') ? '&' : '?'}${params}`;
      }

      // 根据自己的需求来:body传递的是普通对象，我们今天项目需要传递给服务器的是URLENCODED格式，我们才处理它的格式；如果用户传递的本身就不是普通对象(例如:文件流、字符串、FORM-DATA...)，还是以用户自己写的为主...
      if (body && body.constructor === Object) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
      } else if (body && ((settings && settings.feature == 'upload') || body.constructor === File)) {
        // headers['Content-Type'] = 'multipart/form-data';
        if (headers['Content-Type'] == 'application/json') {
          delete headers['Content-Type'];
        }
      } else if (typeof body === 'string') {
        try {
          // 是JSON字符串
          body = JSON.parse(body);
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        } catch (err) {
          // 不是JSON字符串:可以简单粗暴的按照URLECCODED格式字符串处理
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      }

      // 类似于AXIOS中的请求拦截器，例如：我们每一次发请求都需要携带TOKEN信息
      let token = "";
      if(check_jackery_token && check_jackery_token != "") {
        token = check_jackery_token;
      }
      if (token) {
        if(token.indexOf('+') > 0) {
          token = token.replace(/\+/g, '%2B');
        }

        if(token.indexOf('%2F') > 0) {
          token = token.replace('%2F', '/');
        }
        
        headers.jackeryToken = token;
      }


      // jackery-life 三方代码 需要
      if (settings && settings.headers?.authorization) {
        headers.Authorization = settings.headers.authorization;
      }


      // 把config配置成为fetch需要的对象
      config = {
        method: method.toUpperCase(), headers, credentials, cache
      };
      if (/^(POST|PUT|PATCH)$/i.test(method) && body != null) { config.body = body; }

      // 发送请求
      return fetch(url, config).then((r) => {
        let { status, statusText } = r;
        // 只要状态码是以2或者3开始的，才是真正的获取成功
        if (status >= 200 && status < 400) {
          let result;
          switch (responseType.toUpperCase()) {
            case 'JSON': result = r.json(); break;
            case 'TEXT': result = r.text(); break;
            case 'BLOB': result = r.blob(); break;
            case 'ARRAYBUFFER': result = r.arrayBuffer(); break;
          }
          return result
        }
        return Promise.reject({ code: 'STATUS ERROR', status, statusText })
      }).then((r) => {
        // 处理OS接口和第三方接口的状态
        if (r.code || r.code >= 0) {
          switch (r.code) {
            case 200: return Promise.resolve(r);
            case 30001: case 30002:
              toast.warning("The Order ID does not exist, please try a different one.");
              return Promise.reject(r);
            case 50005:
              toast.warning("The email provided has been used.", 5000, 'red');
              return Promise.reject(r);
            default:
              return Promise.reject(r);
          }
        } else {
          return Promise.resolve(r)
        }
      }).catch((e) => {
        if (e && e.code === 'STATUS ERROR') {
          // @1 状态码错误
          switch (e.status) {
            case 400: break;
            case 401: break;
            case 404: break;
            case 50006: break;
            default: console.error("Oops, something went wrong, Please try again later."); break;
          }
        } else if (!navigator.onLine) {
          console.log("网络中断");
        }
        return Promise.reject(e)
      })
    }

    const post = (url, body, settings) => request(url, { method: 'POST', body }, settings);

    // email电话订阅
    const footerPhoneSubs = (params) => post("/v1/notice/subscribe", { shopify_shop_id: shopId, ...params });

    // 创建组合券(需要加前缀/osconsumerapi)
    const createCoupons = (params) => post("/osconsumerapi/v1/service/create-combinesWith-coupon", { shopShopifyId: shopId, ...params });

    function createClues(data) {
    	// determine if 0 or 1 based
    	const minX = Math.min(...data.map(d => d.x));
    	const minY = Math.min(...data.map(d => d.y));
    	const adjust = Math.min(minX, minY);
      const showPos = {}; // 记录显示答案的索引集合

    	const withAdjust = data.map(d => ({
    		...d,
    		x: d.x - adjust,
    		y: d.y - adjust
    	}));

      const withId = withAdjust.map((d, i) => ({
    		...d,
        id: `${d.x}-${d.y}`,
      }));
    	
      // sort asc by start position of clue so we have proper clue ordering
      withId.sort((a, b) => a.y - b.y || a.x - b.x);

      // create a lookup to store clue number (and reuse if same start pos)
      let lookup = {};
      let currentNumber = 1;

      const withNumber = withId.map((d) => {
        let number;
        if (lookup[d.id]) number = lookup[d.id];
        else {
          lookup[d.id] = number = currentNumber;
          currentNumber += 1;
        }
        return {
          ...d,
          number,
        };
      });


    	// create cells for each letter
    	const withCells = withNumber.map(d => {
    		const chars = d.answer.split("");

        const visibleWords = d.uncheck || [];
        const cells = chars.map((answer, i) => {
          const x = d.x + (d.direction === "across" ? i : 0);
          const y = d.y + (d.direction === "down" ? i : 0);
          const number = i === 0 ? d.number : "";
          const clueNumbers = { [d.direction]: d.number };
          const id = `${x}-${y}`;
          const value = "";
          const custom = d.custom || "";
          const show = visibleWords.includes(i+ 1);
          if(show) {
            showPos[id] = true;
          }
          return {
            id,
            number,
            clueNumbers,
            x,
            y,
            value: showPos[id] ? answer.toUpperCase() : value,
            answer: answer.toUpperCase(),
            custom,
            show
          };
        });
    		return {
    			...d,
    			cells
    		}
    	});

    	withCells.sort((a, b) => {
    		if (a.direction < b.direction) return -1;
    		else if (a.direction > b.direction) return 1;
    		return a.number - b.number;
    	});
    	const withIndex = withCells.map((d, i) => ({
    		...d,
    		index: i
    	}));
    	return withIndex;
    }

    function createCells(data) {
      const cells = [].concat(...data.map(d => d.cells));
      let dict = {};
      // sort so that ones with number values come first and dedupe
      cells.sort((a, b) => a.y - b.y || a.x - b.x || b.number - a.number);
      cells.forEach((d, index) => {
        if (!dict[d.id]) {
          dict[d.id] = d;
        } else {
          // consolidate clue numbers for across & down
          dict[d.id].clueNumbers = {
            ...d.clueNumbers,
            ...dict[d.id].clueNumbers,
          };
          // consolidate custom classes
          if (dict[d.id].custom !== d.custom)
            dict[d.id].custom = `${dict[d.id].custom} ${d.custom}`;
        }
      });

      const unique = Object.keys(dict).map((d) => dict[d]);
      unique.sort((a, b) => a.y - b.y || a.x - b.x);
      // add index
      const output = unique.map((d, i) => ({ ...d, index: i }));
      return output;
    }

    function validateClues(data) {
    	const props = [
        {
          prop: "clue",
          type: "string",
        },
        {
          prop: "answer",
          type: "string",
        },
        {
          prop: "x",
          type: "number",
        },
        {
          prop: "y",
          type: "number",
        }
      ];

    	// only store if they fail
    	let failedProp = false;
      data.forEach(d => !!props.map(p => {
    		const f = typeof d[p.prop] !== p.type;
    		if (f) {
    			failedProp = true;
    			console.error(`"${p.prop}" is not a ${p.type}\n`, d);
    		}
    	}));

    	let failedCell = false;
    	const cells = [].concat(...data.map(d => d.cells));
    	
    	let dict = {};
    	cells.forEach((d) => {
        if (!dict[d.id]) {
          dict[d.id] = d.answer;
        } else {
    			if (dict[d.id] !== d.answer) {
    				failedCell = true;
    				console.error(`cell "${d.id}" has two different values\n`, `${dict[d.id]} and ${d.answer}`);
    			}
    		}
      });

    	return !failedProp && !failedCell;
    }

    var classic = {
    	"font": "sans-serif",
    	"primary-highlight-color": "#ffda00",
    	"secondary-highlight-color": "#D3C0B6",
    	"main-color": "#1a1a1a",
    	"bg-color": "#fff",
    	"accent-color": "#efefef",
    	"scrollbar-color": "#cdcdcd",
    	"order": "row"
    };

    var dark = {
    	"primary-highlight-color": "#066",
    	"secondary-highlight-color": "#003d3d",
    	"main-color": "#efefef",
    	"bg-color": "#1a1a1a",
    	"accent-color": "#3a3a3a"
    };

    var citrus = {
    	"primary-highlight-color": "#ff957d",
    	"secondary-highlight-color": "#ffdfd5",
    	"main-color": "#184444",
    	"accent-color": "#ebf3f3"
    };

    var amelia = {
    	"font": "sans-serif",
    	"primary-highlight-color": "#d7cefd",
    	"secondary-highlight-color": "#9980fa",
    	"main-color": "#353b48",
    	"bg-color": "#fff",
    	"accent-color": "#efefef",
    	"scrollbar-color": "#9980fa",
    };

    const themes = { classic, dark, citrus, amelia };
    const defaultTheme = themes["classic"];

    Object.keys(themes).forEach((t) => {
    	themes[t] = Object.keys(defaultTheme)
    		.map((d) => `--${d}: var(--xd-${d}, ${themes[t][d] || defaultTheme[d]})`)
    		.join(";");
    });

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Crossword.svelte generated by Svelte v3.59.2 */
    const get_message_slot_changes_1 = dirty => ({});
    const get_message_slot_context_1 = ctx => ({ slot: "message" });
    const get_message_slot_changes = dirty => ({});
    const get_message_slot_context = ctx => ({ slot: "message" });
    const get_footer_slot_changes = dirty => ({});
    const get_footer_slot_context = ctx => ({ slot: "footer" });
    const get_toolbar_slot_changes = dirty => ({});

    const get_toolbar_slot_context = ctx => ({
    	onClear: /*onClear*/ ctx[46],
    	onReveal: /*onReveal*/ ctx[47],
    	onCheck: /*onCheck*/ ctx[48]
    });

    // (265:0) {#if validated}
    function create_if_block(ctx) {
    	let article;
    	let t0;
    	let div;
    	let clues_1;
    	let updating_focusedCellIndex;
    	let updating_focusedCell;
    	let updating_focusedDirection;
    	let t1;
    	let puzzle;
    	let updating_cells;
    	let updating_focusedCellIndex_1;
    	let updating_focusedDirection_1;
    	let t2;
    	let t3;
    	let article_resize_listener;
    	let current;
    	const toolbar_slot_template = /*#slots*/ ctx[63].toolbar;
    	const toolbar_slot = create_slot(toolbar_slot_template, ctx, /*$$scope*/ ctx[73], get_toolbar_slot_context);
    	const toolbar_slot_or_fallback = toolbar_slot || fallback_block_3(ctx);

    	function clues_1_focusedCellIndex_binding(value) {
    		/*clues_1_focusedCellIndex_binding*/ ctx[64](value);
    	}

    	function clues_1_focusedCell_binding(value) {
    		/*clues_1_focusedCell_binding*/ ctx[65](value);
    	}

    	function clues_1_focusedDirection_binding(value) {
    		/*clues_1_focusedDirection_binding*/ ctx[66](value);
    	}

    	let clues_1_props = {
    		clues: /*clues*/ ctx[21],
    		cellIndexMap: /*cellIndexMap*/ ctx[43],
    		stacked: /*stacked*/ ctx[41],
    		isDisableHighlight: /*isDisableHighlight*/ ctx[42],
    		isLoaded: /*isLoaded*/ ctx[29]
    	};

    	if (/*focusedCellIndex*/ ctx[20] !== void 0) {
    		clues_1_props.focusedCellIndex = /*focusedCellIndex*/ ctx[20];
    	}

    	if (/*focusedCell*/ ctx[44] !== void 0) {
    		clues_1_props.focusedCell = /*focusedCell*/ ctx[44];
    	}

    	if (/*focusedDirection*/ ctx[27] !== void 0) {
    		clues_1_props.focusedDirection = /*focusedDirection*/ ctx[27];
    	}

    	clues_1 = new Clues({ props: clues_1_props });
    	binding_callbacks.push(() => bind(clues_1, 'focusedCellIndex', clues_1_focusedCellIndex_binding));
    	binding_callbacks.push(() => bind(clues_1, 'focusedCell', clues_1_focusedCell_binding));
    	binding_callbacks.push(() => bind(clues_1, 'focusedDirection', clues_1_focusedDirection_binding));

    	function puzzle_cells_binding(value) {
    		/*puzzle_cells_binding*/ ctx[67](value);
    	}

    	function puzzle_focusedCellIndex_binding(value) {
    		/*puzzle_focusedCellIndex_binding*/ ctx[68](value);
    	}

    	function puzzle_focusedDirection_binding(value) {
    		/*puzzle_focusedDirection_binding*/ ctx[69](value);
    	}

    	let puzzle_props = {
    		clues: /*clues*/ ctx[21],
    		focusedCell: /*focusedCell*/ ctx[44],
    		isRevealing: /*isRevealing*/ ctx[28],
    		isChecking: /*isChecking*/ ctx[30],
    		isDisableHighlight: /*isDisableHighlight*/ ctx[42],
    		revealDuration: /*revealDuration*/ ctx[1],
    		showKeyboard: /*showKeyboard*/ ctx[4],
    		stacked: /*stacked*/ ctx[41],
    		isLoaded: /*isLoaded*/ ctx[29],
    		keyboardStyle: /*keyboardStyle*/ ctx[5]
    	};

    	if (/*cells*/ ctx[22] !== void 0) {
    		puzzle_props.cells = /*cells*/ ctx[22];
    	}

    	if (/*focusedCellIndex*/ ctx[20] !== void 0) {
    		puzzle_props.focusedCellIndex = /*focusedCellIndex*/ ctx[20];
    	}

    	if (/*focusedDirection*/ ctx[27] !== void 0) {
    		puzzle_props.focusedDirection = /*focusedDirection*/ ctx[27];
    	}

    	puzzle = new Puzzle({ props: puzzle_props });
    	binding_callbacks.push(() => bind(puzzle, 'cells', puzzle_cells_binding));
    	binding_callbacks.push(() => bind(puzzle, 'focusedCellIndex', puzzle_focusedCellIndex_binding));
    	binding_callbacks.push(() => bind(puzzle, 'focusedDirection', puzzle_focusedDirection_binding));
    	let if_block0 = /*isComplete*/ ctx[23] && !/*isRevealing*/ ctx[28] && /*showCompleteMessage*/ ctx[2] && create_if_block_3(ctx);
    	let if_block1 = !/*isComplete*/ ctx[23] && !/*isRevealing*/ ctx[28] && !/*isSubscribe*/ ctx[45] && create_if_block_1(ctx);

    	return {
    		c() {
    			article = element("article");
    			if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.c();
    			t0 = space();
    			div = element("div");
    			create_component(clues_1.$$.fragment);
    			t1 = space();
    			create_component(puzzle.$$.fragment);
    			t2 = space();
    			if (if_block0) if_block0.c();
    			t3 = space();
    			if (if_block1) if_block1.c();
    			this.h();
    		},
    		l(nodes) {
    			article = claim_element(nodes, "ARTICLE", { class: true, style: true });
    			var article_nodes = children(article);
    			if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.l(article_nodes);
    			t0 = claim_space(article_nodes);
    			div = claim_element(article_nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			claim_component(clues_1.$$.fragment, div_nodes);
    			t1 = claim_space(div_nodes);
    			claim_component(puzzle.$$.fragment, div_nodes);
    			div_nodes.forEach(detach);
    			t2 = claim_space(article_nodes);
    			if (if_block0) if_block0.l(article_nodes);
    			t3 = claim_space(article_nodes);
    			if (if_block1) if_block1.l(article_nodes);
    			article_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "play svelte-10vn5u1");
    			toggle_class(div, "stacked", /*stacked*/ ctx[41]);
    			toggle_class(div, "is-loaded", /*isLoaded*/ ctx[29]);
    			attr(article, "class", "svelte-crossword svelte-10vn5u1");
    			attr(article, "style", /*inlineStyles*/ ctx[40]);
    			add_render_callback(() => /*article_elementresize_handler*/ ctx[72].call(article));
    		},
    		m(target, anchor) {
    			insert_hydration(target, article, anchor);

    			if (toolbar_slot_or_fallback) {
    				toolbar_slot_or_fallback.m(article, null);
    			}

    			append_hydration(article, t0);
    			append_hydration(article, div);
    			mount_component(clues_1, div, null);
    			append_hydration(div, t1);
    			mount_component(puzzle, div, null);
    			append_hydration(article, t2);
    			if (if_block0) if_block0.m(article, null);
    			append_hydration(article, t3);
    			if (if_block1) if_block1.m(article, null);
    			article_resize_listener = add_iframe_resize_listener(article, /*article_elementresize_handler*/ ctx[72].bind(article));
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (toolbar_slot) {
    				if (toolbar_slot.p && (!current || dirty[2] & /*$$scope*/ 2048)) {
    					update_slot_base(
    						toolbar_slot,
    						toolbar_slot_template,
    						ctx,
    						/*$$scope*/ ctx[73],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[73])
    						: get_slot_changes(toolbar_slot_template, /*$$scope*/ ctx[73], dirty, get_toolbar_slot_changes),
    						get_toolbar_slot_context
    					);
    				}
    			} else {
    				if (toolbar_slot_or_fallback && toolbar_slot_or_fallback.p && (!current || dirty[0] & /*checkModal, error_num, correct_num, modal_correct_words, modal_incorrect_words, actions, btn_reset, btn_check*/ 117455873)) {
    					toolbar_slot_or_fallback.p(ctx, !current ? [-1, -1, -1] : dirty);
    				}
    			}

    			const clues_1_changes = {};
    			if (dirty[0] & /*clues*/ 2097152) clues_1_changes.clues = /*clues*/ ctx[21];
    			if (dirty[1] & /*cellIndexMap*/ 4096) clues_1_changes.cellIndexMap = /*cellIndexMap*/ ctx[43];
    			if (dirty[1] & /*stacked*/ 1024) clues_1_changes.stacked = /*stacked*/ ctx[41];
    			if (dirty[1] & /*isDisableHighlight*/ 2048) clues_1_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[42];
    			if (dirty[0] & /*isLoaded*/ 536870912) clues_1_changes.isLoaded = /*isLoaded*/ ctx[29];

    			if (!updating_focusedCellIndex && dirty[0] & /*focusedCellIndex*/ 1048576) {
    				updating_focusedCellIndex = true;
    				clues_1_changes.focusedCellIndex = /*focusedCellIndex*/ ctx[20];
    				add_flush_callback(() => updating_focusedCellIndex = false);
    			}

    			if (!updating_focusedCell && dirty[1] & /*focusedCell*/ 8192) {
    				updating_focusedCell = true;
    				clues_1_changes.focusedCell = /*focusedCell*/ ctx[44];
    				add_flush_callback(() => updating_focusedCell = false);
    			}

    			if (!updating_focusedDirection && dirty[0] & /*focusedDirection*/ 134217728) {
    				updating_focusedDirection = true;
    				clues_1_changes.focusedDirection = /*focusedDirection*/ ctx[27];
    				add_flush_callback(() => updating_focusedDirection = false);
    			}

    			clues_1.$set(clues_1_changes);
    			const puzzle_changes = {};
    			if (dirty[0] & /*clues*/ 2097152) puzzle_changes.clues = /*clues*/ ctx[21];
    			if (dirty[1] & /*focusedCell*/ 8192) puzzle_changes.focusedCell = /*focusedCell*/ ctx[44];
    			if (dirty[0] & /*isRevealing*/ 268435456) puzzle_changes.isRevealing = /*isRevealing*/ ctx[28];
    			if (dirty[0] & /*isChecking*/ 1073741824) puzzle_changes.isChecking = /*isChecking*/ ctx[30];
    			if (dirty[1] & /*isDisableHighlight*/ 2048) puzzle_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[42];
    			if (dirty[0] & /*revealDuration*/ 2) puzzle_changes.revealDuration = /*revealDuration*/ ctx[1];
    			if (dirty[0] & /*showKeyboard*/ 16) puzzle_changes.showKeyboard = /*showKeyboard*/ ctx[4];
    			if (dirty[1] & /*stacked*/ 1024) puzzle_changes.stacked = /*stacked*/ ctx[41];
    			if (dirty[0] & /*isLoaded*/ 536870912) puzzle_changes.isLoaded = /*isLoaded*/ ctx[29];
    			if (dirty[0] & /*keyboardStyle*/ 32) puzzle_changes.keyboardStyle = /*keyboardStyle*/ ctx[5];

    			if (!updating_cells && dirty[0] & /*cells*/ 4194304) {
    				updating_cells = true;
    				puzzle_changes.cells = /*cells*/ ctx[22];
    				add_flush_callback(() => updating_cells = false);
    			}

    			if (!updating_focusedCellIndex_1 && dirty[0] & /*focusedCellIndex*/ 1048576) {
    				updating_focusedCellIndex_1 = true;
    				puzzle_changes.focusedCellIndex = /*focusedCellIndex*/ ctx[20];
    				add_flush_callback(() => updating_focusedCellIndex_1 = false);
    			}

    			if (!updating_focusedDirection_1 && dirty[0] & /*focusedDirection*/ 134217728) {
    				updating_focusedDirection_1 = true;
    				puzzle_changes.focusedDirection = /*focusedDirection*/ ctx[27];
    				add_flush_callback(() => updating_focusedDirection_1 = false);
    			}

    			puzzle.$set(puzzle_changes);

    			if (!current || dirty[1] & /*stacked*/ 1024) {
    				toggle_class(div, "stacked", /*stacked*/ ctx[41]);
    			}

    			if (!current || dirty[0] & /*isLoaded*/ 536870912) {
    				toggle_class(div, "is-loaded", /*isLoaded*/ ctx[29]);
    			}

    			if (/*isComplete*/ ctx[23] && !/*isRevealing*/ ctx[28] && /*showCompleteMessage*/ ctx[2]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*isComplete, isRevealing, showCompleteMessage*/ 276824068) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_3(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(article, t3);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (!/*isComplete*/ ctx[23] && !/*isRevealing*/ ctx[28] && !/*isSubscribe*/ ctx[45]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*isComplete, isRevealing*/ 276824064) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(article, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}

    			if (!current || dirty[1] & /*inlineStyles*/ 512) {
    				attr(article, "style", /*inlineStyles*/ ctx[40]);
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(toolbar_slot_or_fallback, local);
    			transition_in(clues_1.$$.fragment, local);
    			transition_in(puzzle.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o(local) {
    			transition_out(toolbar_slot_or_fallback, local);
    			transition_out(clues_1.$$.fragment, local);
    			transition_out(puzzle.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(article);
    			if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.d(detaching);
    			destroy_component(clues_1);
    			destroy_component(puzzle);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			article_resize_listener();
    		}
    	};
    }

    // (275:26)        
    function fallback_block_3(ctx) {
    	let toolbar;
    	let t;
    	let checkmodal;
    	let current;

    	toolbar = new Toolbar({
    			props: {
    				actions: /*actions*/ ctx[0],
    				btn_reset: /*btn_reset*/ ctx[12],
    				btn_check: /*btn_check*/ ctx[13]
    			}
    		});

    	toolbar.$on("event", /*onToolbarEvent*/ ctx[49]);

    	checkmodal = new CheckModal({
    			props: {
    				open: /*checkModal*/ ctx[24],
    				error_num: /*error_num*/ ctx[25],
    				correct_num: /*correct_num*/ ctx[26],
    				modal_correct_words: /*modal_correct_words*/ ctx[10],
    				modal_incorrect_words: /*modal_incorrect_words*/ ctx[11]
    			}
    		});

    	return {
    		c() {
    			create_component(toolbar.$$.fragment);
    			t = space();
    			create_component(checkmodal.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(toolbar.$$.fragment, nodes);
    			t = claim_space(nodes);
    			claim_component(checkmodal.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(toolbar, target, anchor);
    			insert_hydration(target, t, anchor);
    			mount_component(checkmodal, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const toolbar_changes = {};
    			if (dirty[0] & /*actions*/ 1) toolbar_changes.actions = /*actions*/ ctx[0];
    			if (dirty[0] & /*btn_reset*/ 4096) toolbar_changes.btn_reset = /*btn_reset*/ ctx[12];
    			if (dirty[0] & /*btn_check*/ 8192) toolbar_changes.btn_check = /*btn_check*/ ctx[13];
    			toolbar.$set(toolbar_changes);
    			const checkmodal_changes = {};
    			if (dirty[0] & /*checkModal*/ 16777216) checkmodal_changes.open = /*checkModal*/ ctx[24];
    			if (dirty[0] & /*error_num*/ 33554432) checkmodal_changes.error_num = /*error_num*/ ctx[25];
    			if (dirty[0] & /*correct_num*/ 67108864) checkmodal_changes.correct_num = /*correct_num*/ ctx[26];
    			if (dirty[0] & /*modal_correct_words*/ 1024) checkmodal_changes.modal_correct_words = /*modal_correct_words*/ ctx[10];
    			if (dirty[0] & /*modal_incorrect_words*/ 2048) checkmodal_changes.modal_incorrect_words = /*modal_incorrect_words*/ ctx[11];
    			checkmodal.$set(checkmodal_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(toolbar.$$.fragment, local);
    			transition_in(checkmodal.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(toolbar.$$.fragment, local);
    			transition_out(checkmodal.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(toolbar, detaching);
    			if (detaching) detach(t);
    			destroy_component(checkmodal, detaching);
    		}
    	};
    }

    // (307:4) {#if isComplete && !isRevealing && showCompleteMessage}
    function create_if_block_3(ctx) {
    	let completedmessage;
    	let current;

    	completedmessage = new CompletedMessage({
    			props: {
    				shopurl: /*shopurl*/ ctx[18],
    				success_copy: /*success_copy*/ ctx[16],
    				outClickClose: !!/*coupons_api_error*/ ctx[38],
    				showCloseBtn: !!/*coupons_api_error*/ ctx[38],
    				showConfetti: /*showConfetti*/ ctx[3] && !/*coupons_api_error*/ ctx[38],
    				btnShopNow: !/*coupons_api_error*/ ctx[38],
    				$$slots: {
    					footer: [create_footer_slot],
    					message: [create_message_slot_1]
    				},
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(completedmessage.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(completedmessage.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(completedmessage, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const completedmessage_changes = {};
    			if (dirty[0] & /*shopurl*/ 262144) completedmessage_changes.shopurl = /*shopurl*/ ctx[18];
    			if (dirty[0] & /*success_copy*/ 65536) completedmessage_changes.success_copy = /*success_copy*/ ctx[16];
    			if (dirty[1] & /*coupons_api_error*/ 128) completedmessage_changes.outClickClose = !!/*coupons_api_error*/ ctx[38];
    			if (dirty[1] & /*coupons_api_error*/ 128) completedmessage_changes.showCloseBtn = !!/*coupons_api_error*/ ctx[38];
    			if (dirty[0] & /*showConfetti*/ 8 | dirty[1] & /*coupons_api_error*/ 128) completedmessage_changes.showConfetti = /*showConfetti*/ ctx[3] && !/*coupons_api_error*/ ctx[38];
    			if (dirty[1] & /*coupons_api_error*/ 128) completedmessage_changes.btnShopNow = !/*coupons_api_error*/ ctx[38];

    			if (dirty[0] & /*success_des, success_couponinfo, success_title*/ 180224 | dirty[1] & /*coupons_api_error, coupons_code*/ 384 | dirty[2] & /*$$scope*/ 2048) {
    				completedmessage_changes.$$scope = { dirty, ctx };
    			}

    			completedmessage.$set(completedmessage_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(completedmessage.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(completedmessage.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(completedmessage, detaching);
    		}
    	};
    }

    // (310:10) {#if coupons_api_error === ""}
    function create_if_block_6(ctx) {
    	let div0;
    	let t0;
    	let t1;
    	let div4;
    	let img;
    	let img_src_value;
    	let t2;
    	let div3;
    	let div1;
    	let t3;
    	let t4;
    	let t5;
    	let div2;

    	return {
    		c() {
    			div0 = element("div");
    			t0 = text(/*success_title*/ ctx[14]);
    			t1 = space();
    			div4 = element("div");
    			img = element("img");
    			t2 = space();
    			div3 = element("div");
    			div1 = element("div");
    			t3 = text("CODE:");
    			t4 = text(/*coupons_code*/ ctx[39]);
    			t5 = space();
    			div2 = element("div");
    			this.h();
    		},
    		l(nodes) {
    			div0 = claim_element(nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			t0 = claim_text(div0_nodes, /*success_title*/ ctx[14]);
    			div0_nodes.forEach(detach);
    			t1 = claim_space(nodes);
    			div4 = claim_element(nodes, "DIV", { class: true });
    			var div4_nodes = children(div4);
    			img = claim_element(div4_nodes, "IMG", { src: true, alt: true, class: true });
    			t2 = claim_space(div4_nodes);
    			div3 = claim_element(div4_nodes, "DIV", { class: true });
    			var div3_nodes = children(div3);
    			div1 = claim_element(div3_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			t3 = claim_text(div1_nodes, "CODE:");
    			t4 = claim_text(div1_nodes, /*coupons_code*/ ctx[39]);
    			div1_nodes.forEach(detach);
    			t5 = claim_space(div3_nodes);
    			div2 = claim_element(div3_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			div2_nodes.forEach(detach);
    			div3_nodes.forEach(detach);
    			div4_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div0, "class", "title_gameend svelte-10vn5u1");
    			if (!src_url_equal(img.src, img_src_value = "https://cdn.shopify.com/s/files/1/0550/0524/9633/files/coupon_s_code.png?v=1706604693")) attr(img, "src", img_src_value);
    			attr(img, "alt", "coupon");
    			attr(img, "class", "svelte-10vn5u1");
    			attr(div1, "class", "coupone_info_title svelte-10vn5u1");
    			attr(div2, "class", "coupone_info_des svelte-10vn5u1");
    			attr(div3, "class", "coupone_info svelte-10vn5u1");
    			attr(div4, "class", "coupon_gameend svelte-10vn5u1");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div0, anchor);
    			append_hydration(div0, t0);
    			insert_hydration(target, t1, anchor);
    			insert_hydration(target, div4, anchor);
    			append_hydration(div4, img);
    			append_hydration(div4, t2);
    			append_hydration(div4, div3);
    			append_hydration(div3, div1);
    			append_hydration(div1, t3);
    			append_hydration(div1, t4);
    			append_hydration(div3, t5);
    			append_hydration(div3, div2);
    			div2.innerHTML = /*success_couponinfo*/ ctx[15];
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*success_title*/ 16384) set_data(t0, /*success_title*/ ctx[14]);
    			if (dirty[1] & /*coupons_code*/ 256) set_data(t4, /*coupons_code*/ ctx[39]);
    			if (dirty[0] & /*success_couponinfo*/ 32768) div2.innerHTML = /*success_couponinfo*/ ctx[15];		},
    		d(detaching) {
    			if (detaching) detach(div0);
    			if (detaching) detach(t1);
    			if (detaching) detach(div4);
    		}
    	};
    }

    // (321:10) {#if coupons_api_error !== ""}
    function create_if_block_5(ctx) {
    	let div;
    	let t;

    	return {
    		c() {
    			div = element("div");
    			t = text(/*coupons_api_error*/ ctx[38]);
    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			t = claim_text(div_nodes, /*coupons_api_error*/ ctx[38]);
    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "title_gameend svelte-10vn5u1");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);
    			append_hydration(div, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[1] & /*coupons_api_error*/ 128) set_data(t, /*coupons_api_error*/ ctx[38]);
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (309:44)            
    function fallback_block_2(ctx) {
    	let t;
    	let if_block1_anchor;
    	let if_block0 = /*coupons_api_error*/ ctx[38] === "" && create_if_block_6(ctx);
    	let if_block1 = /*coupons_api_error*/ ctx[38] !== "" && create_if_block_5(ctx);

    	return {
    		c() {
    			if (if_block0) if_block0.c();
    			t = space();
    			if (if_block1) if_block1.c();
    			if_block1_anchor = empty();
    		},
    		l(nodes) {
    			if (if_block0) if_block0.l(nodes);
    			t = claim_space(nodes);
    			if (if_block1) if_block1.l(nodes);
    			if_block1_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block0) if_block0.m(target, anchor);
    			insert_hydration(target, t, anchor);
    			if (if_block1) if_block1.m(target, anchor);
    			insert_hydration(target, if_block1_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*coupons_api_error*/ ctx[38] === "") {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_6(ctx);
    					if_block0.c();
    					if_block0.m(t.parentNode, t);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (/*coupons_api_error*/ ctx[38] !== "") {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_5(ctx);
    					if_block1.c();
    					if_block1.m(if_block1_anchor.parentNode, if_block1_anchor);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}
    		},
    		d(detaching) {
    			if (if_block0) if_block0.d(detaching);
    			if (detaching) detach(t);
    			if (if_block1) if_block1.d(detaching);
    			if (detaching) detach(if_block1_anchor);
    		}
    	};
    }

    // (309:8) 
    function create_message_slot_1(ctx) {
    	let current;
    	const message_slot_template = /*#slots*/ ctx[63].message;
    	const message_slot = create_slot(message_slot_template, ctx, /*$$scope*/ ctx[73], get_message_slot_context);
    	const message_slot_or_fallback = message_slot || fallback_block_2(ctx);

    	return {
    		c() {
    			if (message_slot_or_fallback) message_slot_or_fallback.c();
    		},
    		l(nodes) {
    			if (message_slot_or_fallback) message_slot_or_fallback.l(nodes);
    		},
    		m(target, anchor) {
    			if (message_slot_or_fallback) {
    				message_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (message_slot) {
    				if (message_slot.p && (!current || dirty[2] & /*$$scope*/ 2048)) {
    					update_slot_base(
    						message_slot,
    						message_slot_template,
    						ctx,
    						/*$$scope*/ ctx[73],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[73])
    						: get_slot_changes(message_slot_template, /*$$scope*/ ctx[73], dirty, get_message_slot_changes),
    						get_message_slot_context
    					);
    				}
    			} else {
    				if (message_slot_or_fallback && message_slot_or_fallback.p && (!current || dirty[0] & /*success_couponinfo, success_title*/ 49152 | dirty[1] & /*coupons_api_error, coupons_code*/ 384)) {
    					message_slot_or_fallback.p(ctx, !current ? [-1, -1, -1] : dirty);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(message_slot_or_fallback, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(message_slot_or_fallback, local);
    			current = false;
    		},
    		d(detaching) {
    			if (message_slot_or_fallback) message_slot_or_fallback.d(detaching);
    		}
    	};
    }

    // (327:10) {#if coupons_api_error === ""}
    function create_if_block_4(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			this.h();
    		},
    		l(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			div_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(div, "class", "footer_gameend svelte-10vn5u1");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div, anchor);
    			div.innerHTML = /*success_des*/ ctx[17];
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*success_des*/ 131072) div.innerHTML = /*success_des*/ ctx[17];		},
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    // (326:42)            
    function fallback_block_1(ctx) {
    	let if_block_anchor;
    	let if_block = /*coupons_api_error*/ ctx[38] === "" && create_if_block_4(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration(target, if_block_anchor, anchor);
    		},
    		p(ctx, dirty) {
    			if (/*coupons_api_error*/ ctx[38] === "") {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block_4(ctx);
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    // (326:8) 
    function create_footer_slot(ctx) {
    	let current;
    	const footer_slot_template = /*#slots*/ ctx[63].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[73], get_footer_slot_context);
    	const footer_slot_or_fallback = footer_slot || fallback_block_1(ctx);

    	return {
    		c() {
    			if (footer_slot_or_fallback) footer_slot_or_fallback.c();
    		},
    		l(nodes) {
    			if (footer_slot_or_fallback) footer_slot_or_fallback.l(nodes);
    		},
    		m(target, anchor) {
    			if (footer_slot_or_fallback) {
    				footer_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (footer_slot) {
    				if (footer_slot.p && (!current || dirty[2] & /*$$scope*/ 2048)) {
    					update_slot_base(
    						footer_slot,
    						footer_slot_template,
    						ctx,
    						/*$$scope*/ ctx[73],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[73])
    						: get_slot_changes(footer_slot_template, /*$$scope*/ ctx[73], dirty, get_footer_slot_changes),
    						get_footer_slot_context
    					);
    				}
    			} else {
    				if (footer_slot_or_fallback && footer_slot_or_fallback.p && (!current || dirty[0] & /*success_des*/ 131072 | dirty[1] & /*coupons_api_error*/ 128)) {
    					footer_slot_or_fallback.p(ctx, !current ? [-1, -1, -1] : dirty);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(footer_slot_or_fallback, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(footer_slot_or_fallback, local);
    			current = false;
    		},
    		d(detaching) {
    			if (footer_slot_or_fallback) footer_slot_or_fallback.d(detaching);
    		}
    	};
    }

    // (334:4) {#if !isComplete && !isRevealing && !isSubscribe}
    function create_if_block_1(ctx) {
    	let completedmessage;
    	let current;

    	completedmessage = new CompletedMessage({
    			props: {
    				showConfetti: false,
    				outClickClose: false,
    				funcClose: /*subscribeModalClose*/ ctx[36],
    				subscribeModal: !/*isSubscribe*/ ctx[45],
    				$$slots: { message: [create_message_slot] },
    				$$scope: { ctx }
    			}
    		});

    	return {
    		c() {
    			create_component(completedmessage.$$.fragment);
    		},
    		l(nodes) {
    			claim_component(completedmessage.$$.fragment, nodes);
    		},
    		m(target, anchor) {
    			mount_component(completedmessage, target, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			const completedmessage_changes = {};
    			if (dirty[1] & /*subscribeModalClose*/ 32) completedmessage_changes.funcClose = /*subscribeModalClose*/ ctx[36];

    			if (dirty[0] & /*modal_email_playnow, modal_email_policy, modal_email, modal_title*/ 960 | dirty[1] & /*subscribeLoading, subscribe_error, subscribe_error_txt, subscribe_agree, subscribe_email*/ 94 | dirty[2] & /*$$scope*/ 2048) {
    				completedmessage_changes.$$scope = { dirty, ctx };
    			}

    			completedmessage.$set(completedmessage_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(completedmessage.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(completedmessage.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			destroy_component(completedmessage, detaching);
    		}
    	};
    }

    // (368:14) {#if subscribeLoading}
    function create_if_block_2(ctx) {
    	let span;
    	let svg;
    	let path;
    	let t;

    	return {
    		c() {
    			span = element("span");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t = text("\n                Loading");
    			this.h();
    		},
    		l(nodes) {
    			span = claim_element(nodes, "SPAN", { class: true });
    			var span_nodes = children(span);

    			svg = claim_svg_element(span_nodes, "svg", {
    				class: true,
    				viewBox: true,
    				focusable: true,
    				"data-icon": true,
    				width: true,
    				height: true,
    				fill: true,
    				"aria-hidden": true
    			});

    			var svg_nodes = children(svg);
    			path = claim_svg_element(svg_nodes, "path", { d: true });
    			children(path).forEach(detach);
    			svg_nodes.forEach(detach);
    			t = claim_text(span_nodes, "\n                Loading");
    			span_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(path, "d", "M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 00-94.3-139.9 437.71 437.71 0 00-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z");
    			attr(svg, "class", "anticon-loading svelte-10vn5u1");
    			attr(svg, "viewBox", "0 0 1024 1024");
    			attr(svg, "focusable", "false");
    			attr(svg, "data-icon", "loading");
    			attr(svg, "width", "1em");
    			attr(svg, "height", "1em");
    			attr(svg, "fill", "currentColor");
    			attr(svg, "aria-hidden", "true");
    			attr(span, "class", "crossword_submit_loading svelte-10vn5u1");
    		},
    		m(target, anchor) {
    			insert_hydration(target, span, anchor);
    			append_hydration(span, svg);
    			append_hydration(svg, path);
    			append_hydration(span, t);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    // (337:44)            
    function fallback_block(ctx) {
    	let div2;
    	let h3;
    	let t0;
    	let input0;
    	let t1;
    	let label;
    	let span1;
    	let input1;
    	let t2;
    	let span0;
    	let i;
    	let t3;
    	let span3;
    	let span2;
    	let t4;
    	let div0;
    	let t5;
    	let t6;
    	let div1;
    	let t7;
    	let t8;
    	let t9;
    	let svg;
    	let path0;
    	let path1;
    	let path2;
    	let path3;
    	let path4;
    	let path5;
    	let path6;
    	let path7;
    	let path8;
    	let path9;
    	let path10;
    	let path11;
    	let path12;
    	let path13;
    	let path14;
    	let path15;
    	let path16;
    	let path17;
    	let path18;
    	let path19;
    	let path20;
    	let path21;
    	let path22;
    	let path23;
    	let path24;
    	let path25;
    	let path26;
    	let path27;
    	let mounted;
    	let dispose;
    	let if_block = /*subscribeLoading*/ ctx[37] && create_if_block_2();

    	return {
    		c() {
    			div2 = element("div");
    			h3 = element("h3");
    			t0 = space();
    			input0 = element("input");
    			t1 = space();
    			label = element("label");
    			span1 = element("span");
    			input1 = element("input");
    			t2 = space();
    			span0 = element("span");
    			i = element("i");
    			t3 = space();
    			span3 = element("span");
    			span2 = element("span");
    			t4 = space();
    			div0 = element("div");
    			t5 = text(/*subscribe_error_txt*/ ctx[35]);
    			t6 = space();
    			div1 = element("div");
    			t7 = text(/*modal_email_playnow*/ ctx[9]);
    			t8 = space();
    			if (if_block) if_block.c();
    			t9 = space();
    			svg = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			path2 = svg_element("path");
    			path3 = svg_element("path");
    			path4 = svg_element("path");
    			path5 = svg_element("path");
    			path6 = svg_element("path");
    			path7 = svg_element("path");
    			path8 = svg_element("path");
    			path9 = svg_element("path");
    			path10 = svg_element("path");
    			path11 = svg_element("path");
    			path12 = svg_element("path");
    			path13 = svg_element("path");
    			path14 = svg_element("path");
    			path15 = svg_element("path");
    			path16 = svg_element("path");
    			path17 = svg_element("path");
    			path18 = svg_element("path");
    			path19 = svg_element("path");
    			path20 = svg_element("path");
    			path21 = svg_element("path");
    			path22 = svg_element("path");
    			path23 = svg_element("path");
    			path24 = svg_element("path");
    			path25 = svg_element("path");
    			path26 = svg_element("path");
    			path27 = svg_element("path");
    			this.h();
    		},
    		l(nodes) {
    			div2 = claim_element(nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			h3 = claim_element(div2_nodes, "H3", { class: true });
    			var h3_nodes = children(h3);
    			h3_nodes.forEach(detach);
    			t0 = claim_space(div2_nodes);

    			input0 = claim_element(div2_nodes, "INPUT", {
    				type: true,
    				placeholder: true,
    				class: true
    			});

    			t1 = claim_space(div2_nodes);
    			label = claim_element(div2_nodes, "LABEL", { class: true });
    			var label_nodes = children(label);
    			span1 = claim_element(label_nodes, "SPAN", { class: true });
    			var span1_nodes = children(span1);
    			input1 = claim_element(span1_nodes, "INPUT", { type: true, class: true });
    			t2 = claim_space(span1_nodes);
    			span0 = claim_element(span1_nodes, "SPAN", { class: true });
    			var span0_nodes = children(span0);
    			i = claim_element(span0_nodes, "I", { style: true, class: true });
    			children(i).forEach(detach);
    			span0_nodes.forEach(detach);
    			span1_nodes.forEach(detach);
    			t3 = claim_space(label_nodes);
    			span3 = claim_element(label_nodes, "SPAN", { class: true });
    			var span3_nodes = children(span3);
    			span2 = claim_element(span3_nodes, "SPAN", { class: true });
    			var span2_nodes = children(span2);
    			span2_nodes.forEach(detach);
    			span3_nodes.forEach(detach);
    			label_nodes.forEach(detach);
    			t4 = claim_space(div2_nodes);
    			div0 = claim_element(div2_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			t5 = claim_text(div0_nodes, /*subscribe_error_txt*/ ctx[35]);
    			div0_nodes.forEach(detach);
    			t6 = claim_space(div2_nodes);
    			div1 = claim_element(div2_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			t7 = claim_text(div1_nodes, /*modal_email_playnow*/ ctx[9]);
    			t8 = claim_space(div1_nodes);
    			if (if_block) if_block.l(div1_nodes);
    			div1_nodes.forEach(detach);
    			t9 = claim_space(div2_nodes);

    			svg = claim_svg_element(div2_nodes, "svg", {
    				class: true,
    				xmlns: true,
    				width: true,
    				height: true,
    				viewBox: true,
    				fill: true
    			});

    			var svg_nodes = children(svg);

    			path0 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path0).forEach(detach);

    			path1 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path1).forEach(detach);

    			path2 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path2).forEach(detach);

    			path3 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path3).forEach(detach);

    			path4 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path4).forEach(detach);

    			path5 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path5).forEach(detach);

    			path6 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path6).forEach(detach);
    			path7 = claim_svg_element(svg_nodes, "path", { d: true, fill: true });
    			children(path7).forEach(detach);
    			path8 = claim_svg_element(svg_nodes, "path", { d: true, fill: true });
    			children(path8).forEach(detach);

    			path9 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path9).forEach(detach);

    			path10 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path10).forEach(detach);

    			path11 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path11).forEach(detach);
    			path12 = claim_svg_element(svg_nodes, "path", { d: true, fill: true });
    			children(path12).forEach(detach);

    			path13 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path13).forEach(detach);

    			path14 = claim_svg_element(svg_nodes, "path", {
    				d: true,
    				stroke: true,
    				"stroke-width": true,
    				"stroke-linecap": true,
    				"stroke-linejoin": true
    			});

    			children(path14).forEach(detach);

    			path15 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path15).forEach(detach);
    			path16 = claim_svg_element(svg_nodes, "path", { d: true, fill: true });
    			children(path16).forEach(detach);

    			path17 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path17).forEach(detach);

    			path18 = claim_svg_element(svg_nodes, "path", {
    				d: true,
    				stroke: true,
    				"stroke-width": true,
    				"stroke-linecap": true,
    				"stroke-linejoin": true
    			});

    			children(path18).forEach(detach);

    			path19 = claim_svg_element(svg_nodes, "path", {
    				d: true,
    				stroke: true,
    				"stroke-width": true,
    				"stroke-linecap": true,
    				"stroke-linejoin": true
    			});

    			children(path19).forEach(detach);

    			path20 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path20).forEach(detach);

    			path21 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path21).forEach(detach);

    			path22 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path22).forEach(detach);

    			path23 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path23).forEach(detach);

    			path24 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path24).forEach(detach);

    			path25 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path25).forEach(detach);

    			path26 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path26).forEach(detach);

    			path27 = claim_svg_element(svg_nodes, "path", {
    				d: true,
    				stroke: true,
    				"stroke-width": true,
    				"stroke-linecap": true,
    				"stroke-linejoin": true
    			});

    			children(path27).forEach(detach);
    			svg_nodes.forEach(detach);
    			div2_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(h3, "class", "svelte-10vn5u1");
    			attr(input0, "type", "text");
    			attr(input0, "placeholder", /*modal_email*/ ctx[7]);
    			attr(input0, "class", "svelte-10vn5u1");
    			attr(input1, "type", "checkbox");
    			attr(input1, "class", "dji-checkbox-original svelte-10vn5u1");
    			set_style(i, "font-size", "12px");
    			attr(i, "class", "font-bold iconfont jackery-icon-checkbox");
    			attr(span0, "class", "dji-checkbox-inner");
    			attr(span1, "class", "dji-checkbox-input");
    			attr(span2, "class", "dji-agree");
    			attr(span3, "class", "dji-checkbox-label");
    			attr(label, "class", "dji-checkbox svelte-10vn5u1");
    			attr(div0, "class", "error__tips svelte-10vn5u1");
    			toggle_class(div0, "active", /*subscribe_error*/ ctx[34]);
    			attr(div1, "class", "crossword_subscribe_submit svelte-10vn5u1");
    			toggle_class(div1, "loading", /*subscribeLoading*/ ctx[37]);
    			attr(path0, "fill-rule", "evenodd");
    			attr(path0, "clip-rule", "evenodd");
    			attr(path0, "d", "M84.3672 20.2232C83.8654 19.3658 83.8488 18.3209 84.1549 17.3752C86.6335 9.69678 75.7514 8.42302 72.3299 7.30917C68.7595 6.14569 70.4909 0.0332954 63.6727 0.00021073C56.8572 -0.0328739 55.9226 3.84079 55.5973 3.84079C55.1203 3.84079 58.3047 9.53687 58.3047 9.53687C58.3047 9.53687 61.6931 9.51757 63.6534 15.6713C65.6164 21.8278 65.0402 25.5499 70.4137 29.1285C75.7872 32.7072 88.7757 21.5356 88.7757 21.5356C86.2668 22.3296 84.9985 21.3067 84.3644 20.2232H84.3672Z");
    			attr(path0, "fill", "#5C3420");
    			attr(path1, "fill-rule", "evenodd");
    			attr(path1, "clip-rule", "evenodd");
    			attr(path1, "d", "M56.0108 171.39C56.0108 171.39 61.1059 137.324 54.5275 123.842L58.12 77.6279L36.5791 79.114L51.095 171.66L56.0108 171.393V171.39Z");
    			attr(path1, "fill", "#E3633D");
    			attr(path2, "fill-rule", "evenodd");
    			attr(path2, "clip-rule", "evenodd");
    			attr(path2, "d", "M50.935 170.053L46.6588 173.166C45.8179 173.935 41.2329 175.429 41.2329 175.429C40.7752 176.386 41.6685 176.888 42.4267 177.014L55.9611 176.73C55.9611 176.73 59.0849 176.082 56.314 170.058C53.852 171.145 51.5774 171.925 50.935 170.05V170.053Z");
    			attr(path2, "fill", "#4A2A1A");
    			attr(path3, "fill-rule", "evenodd");
    			attr(path3, "clip-rule", "evenodd");
    			attr(path3, "d", "M35.0793 86.3373L39.4879 125.383L46.6176 164.712H59.0685C59.0685 164.712 58.3654 157.05 58.5391 154.886C58.7128 152.722 61.0012 133.24 56.1956 123.795L57.406 85.116L35.0793 86.3401V86.3373Z");
    			attr(path3, "fill", "#C9D9B9");
    			attr(path4, "fill-rule", "evenodd");
    			attr(path4, "clip-rule", "evenodd");
    			attr(path4, "d", "M71.9355 128.234L91.8746 165.242C95.7455 166.642 95.9909 164.392 94.8991 160.795C90.3251 145.187 92.3322 135.661 79.4568 121.746L71.9355 128.234Z");
    			attr(path4, "fill", "#E3633D");
    			attr(path5, "fill-rule", "evenodd");
    			attr(path5, "clip-rule", "evenodd");
    			attr(path5, "d", "M52.7629 83.2027L64.5218 121.746C65.0043 123.555 66.0988 126.152 66.959 127.815L85.9303 161.404L95.9164 155.664C95.9164 155.664 94.0388 151.013 93.628 148.961C91.2322 137.04 88.6516 131.848 79.3134 118.642L75.1916 79.114L65.0015 79.5221L52.7657 83.2027H52.7629Z");
    			attr(path5, "fill", "#C9D9B9");
    			attr(path6, "fill-rule", "evenodd");
    			attr(path6, "clip-rule", "evenodd");
    			attr(path6, "d", "M91.6815 165.145L91.5299 170.433C91.6264 171.569 90.0024 176.113 90.0024 176.113C90.4794 177.058 91.4251 176.659 91.9875 176.137L100.038 165.255C100.038 165.255 101.436 162.385 94.9734 160.896C94.3283 163.51 93.5535 165.785 91.6787 165.148L91.6815 165.145Z");
    			attr(path6, "fill", "#4A2A1A");
    			attr(path7, "d", "M23.7476 34.957C18.2225 28.5634 16.4139 25.8615 11.0128 19.3135L5.20093 20.0027C14.0731 34.764 14.3213 40.7303 20.6542 44.4303C28.0073 41.8414 24.6906 36.7105 23.7449 34.9543L23.7476 34.957Z");
    			attr(path7, "fill", "#C95836");
    			attr(path8, "d", "M10.9964 19.3326L7.82308 16.4846C7.18896 15.9166 6.37287 15.5913 5.52094 15.5748L2.07186 15.5031C0.869781 15.4783 0.0123394 16.661 0.412113 17.7969L4.60008 21.1523C5.5237 21.8912 6.76989 22.2854 8.09052 22.2496L10.2879 22.1917L10.9964 19.3354V19.3326Z");
    			attr(path8, "fill", "#C95836");
    			attr(path9, "fill-rule", "evenodd");
    			attr(path9, "clip-rule", "evenodd");
    			attr(path9, "d", "M44.8721 19.6499C44.8721 19.6499 17.1995 37.2565 18.6277 40.9206L19.2149 42.5555C19.9786 44.6785 22.5344 45.5194 24.4092 44.2621L38.3764 34.8937L41.1363 33.1347L44.8721 19.6499Z");
    			attr(path9, "fill", "#C95836");
    			attr(path10, "fill-rule", "evenodd");
    			attr(path10, "clip-rule", "evenodd");
    			attr(path10, "d", "M67.3973 54.7278L37.9574 56.9693C33.1684 58.7283 35.0818 86.3374 35.0818 86.3374L54.4391 87.2335C63.4326 87.046 74.0694 94.0986 75.1887 79.114C76.468 61.9844 67.3973 54.7278 67.3973 54.7278Z");
    			attr(path10, "fill", "#C9D9B9");
    			attr(path11, "fill-rule", "evenodd");
    			attr(path11, "clip-rule", "evenodd");
    			attr(path11, "d", "M44.8723 19.6498L55.6717 18.2686L58.6383 18.354L69.9478 22.1615C73.7635 23.9977 75.5694 28.3897 74.1633 32.3985L71.5441 45.3235C74.5769 55.0201 76.1649 61.8218 75.7624 71.8382C59.8514 77.9423 37.886 77.8871 32.7661 70.6113C33.4002 50.5647 37.2298 32.6273 44.8723 19.6498Z");
    			attr(path11, "fill", "#8CA671");
    			attr(path12, "d", "M49.7797 19.0515C49.7797 19.0515 46.3307 27.8575 52.3548 28.1801C58.379 28.4999 61.5744 19.3492 61.5744 19.3492L57.1576 17.4441L49.7797 19.0515Z");
    			attr(path12, "fill", "#C95836");
    			attr(path13, "fill-rule", "evenodd");
    			attr(path13, "clip-rule", "evenodd");
    			attr(path13, "d", "M7.07593 24.2623L12.6921 20.3639L23.304 32.7458L41.2359 21.089C41.2359 21.089 43.1686 19.8648 44.8724 19.647C46.5763 19.4292 39.4686 35.1306 39.4686 35.1306L25.9949 45.0175C25.9949 45.0175 19.9845 48.7726 16.869 42.9028C13.7563 37.033 7.07593 24.2623 7.07593 24.2623Z");
    			attr(path13, "fill", "#8CA671");
    			attr(path14, "d", "M38.0513 35.9827L40.5409 29.6084");
    			attr(path14, "stroke", "#3A6B26");
    			attr(path14, "stroke-width", "0.725106");
    			attr(path14, "stroke-linecap", "round");
    			attr(path14, "stroke-linejoin", "round");
    			attr(path15, "fill-rule", "evenodd");
    			attr(path15, "clip-rule", "evenodd");
    			attr(path15, "d", "M80.1929 55.4225C84.0059 54.0826 87.8244 55.1606 89.6854 59.3789L94.3779 81.6063L89.7406 80.9694L83.5868 65.1577L80.1929 55.4225Z");
    			attr(path15, "fill", "#C95836");
    			attr(path16, "d", "M89.5588 80.3603L90.8519 84.2698C91.1111 85.05 91.6404 85.7007 92.3462 86.1032L95.2025 87.7299C96.1978 88.2951 97.4826 87.6554 97.6922 86.4892L95.7898 81.6781C95.3707 80.6167 94.5133 79.7124 93.3912 79.1444L91.5219 78.1987L89.5588 80.3575V80.3603Z");
    			attr(path16, "fill", "#C95836");
    			attr(path17, "fill-rule", "evenodd");
    			attr(path17, "clip-rule", "evenodd");
    			attr(path17, "d", "M73.4851 25.4011L87.6205 51.2044L93.7549 74.882L86.3605 78.3338L78.0728 55.8583L69.7024 41.6126L73.4851 25.4011Z");
    			attr(path17, "fill", "#8CA671");
    			attr(path18, "d", "M56.7191 97.0735C56.3718 95.0305 53.3555 85.334 53.3555 85.334H50.3035");
    			attr(path18, "stroke", "#939C89");
    			attr(path18, "stroke-width", "0.675479");
    			attr(path18, "stroke-linecap", "round");
    			attr(path18, "stroke-linejoin", "round");
    			attr(path19, "d", "M71.1361 43.6003L67.1494 34.1574L67.4334 32.2495");
    			attr(path19, "stroke", "#3A6B26");
    			attr(path19, "stroke-width", "0.725106");
    			attr(path19, "stroke-linecap", "round");
    			attr(path19, "stroke-linejoin", "round");
    			attr(path20, "fill-rule", "evenodd");
    			attr(path20, "clip-rule", "evenodd");
    			attr(path20, "d", "M52.9118 3.25635C52.9118 3.25635 47.0035 3.25635 48.5502 10.0966C50.0803 16.8569 56.7882 9.61688 56.7882 9.61688L52.9118 3.25635Z");
    			attr(path20, "fill", "#5C3420");
    			attr(path21, "fill-rule", "evenodd");
    			attr(path21, "clip-rule", "evenodd");
    			attr(path21, "d", "M51.572 12.5394C51.572 12.5394 51.9497 16.8239 52.2613 20.3722C52.344 21.3179 52.9092 22.1478 53.7418 22.542C54.5717 22.939 55.5394 22.837 56.2728 22.2801C56.5127 22.0981 56.747 21.9189 56.9676 21.7508C57.9712 20.9871 58.4564 19.6857 58.2138 18.4064C57.5907 15.1311 56.4575 9.16479 56.4575 9.16479L51.572 12.5367V12.5394Z");
    			attr(path21, "fill", "#C95836");
    			attr(path22, "fill-rule", "evenodd");
    			attr(path22, "clip-rule", "evenodd");
    			attr(path22, "d", "M51.7043 14.4665L52.0104 17.0361C53.8107 16.606 54.8722 15.0152 55.7793 13.179L51.7043 14.4665Z");
    			attr(path22, "fill", "#873B24");
    			attr(path23, "fill-rule", "evenodd");
    			attr(path23, "clip-rule", "evenodd");
    			attr(path23, "d", "M58.1172 8.67659C58.4287 7.52138 57.7836 6.32206 56.678 5.99673C55.4952 5.64934 54.0064 5.21373 52.8236 4.8691C51.7153 4.54376 50.7338 5.28265 50.254 6.37445C49.6888 7.66199 49.1319 10.5155 48.972 12.6385C48.881 13.835 49.4572 15.1309 50.5656 15.4562C51.7484 15.8036 55.6055 15.6657 56.5429 13.5593C57.257 11.9575 57.6595 10.3777 58.1172 8.67659Z");
    			attr(path23, "fill", "#C95836");
    			attr(path24, "fill-rule", "evenodd");
    			attr(path24, "clip-rule", "evenodd");
    			attr(path24, "d", "M49.6612 11.8997L51.5939 12.4235C51.5939 12.4235 51.2135 13.791 50.3119 13.4243C49.4103 13.0576 49.6612 11.8997 49.6612 11.8997Z");
    			attr(path24, "fill", "white");
    			attr(path25, "fill-rule", "evenodd");
    			attr(path25, "clip-rule", "evenodd");
    			attr(path25, "d", "M51.2246 4.60457C51.2246 4.60457 53.1518 10.9017 55.3905 11.5468C56.5402 11.8777 56.3748 13.5678 57.2433 14.2708C58.8175 15.5446 61.8503 11.0892 61.6077 9.07927C61.2493 6.11543 60.5131 4.96298 57.1688 3.46039C55.1258 2.54229 52.7493 1.38984 51.2246 4.60457Z");
    			attr(path25, "fill", "#5C3420");
    			attr(path26, "fill-rule", "evenodd");
    			attr(path26, "clip-rule", "evenodd");
    			attr(path26, "d", "M58.1087 13.6255C57.5573 14.4278 56.5951 14.6897 55.961 14.2155C55.3269 13.7385 55.258 12.7046 55.8094 11.9023C56.3608 11.1 57.323 10.8381 57.9571 11.3123C58.5912 11.7893 58.6602 12.8232 58.1087 13.6255Z");
    			attr(path26, "fill", "#C95836");
    			attr(path27, "d", "M56.7083 2.90063C57.5436 3.52649 58.7126 4.70926 58.7126 4.70926");
    			attr(path27, "stroke", "#BFAB9E");
    			attr(path27, "stroke-width", "0.802303");
    			attr(path27, "stroke-linecap", "round");
    			attr(path27, "stroke-linejoin", "round");
    			attr(svg, "class", "crossword_subscribe_icon svelte-10vn5u1");
    			attr(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr(svg, "width", "101");
    			attr(svg, "height", "178");
    			attr(svg, "viewBox", "0 0 101 178");
    			attr(svg, "fill", "none");
    			attr(div2, "class", "crossword_subscribe_container svelte-10vn5u1");
    		},
    		m(target, anchor) {
    			insert_hydration(target, div2, anchor);
    			append_hydration(div2, h3);
    			h3.innerHTML = /*modal_title*/ ctx[6];
    			append_hydration(div2, t0);
    			append_hydration(div2, input0);
    			set_input_value(input0, /*subscribe_email*/ ctx[32]);
    			append_hydration(div2, t1);
    			append_hydration(div2, label);
    			append_hydration(label, span1);
    			append_hydration(span1, input1);
    			input1.checked = /*subscribe_agree*/ ctx[33];
    			append_hydration(span1, t2);
    			append_hydration(span1, span0);
    			append_hydration(span0, i);
    			append_hydration(label, t3);
    			append_hydration(label, span3);
    			append_hydration(span3, span2);
    			span2.innerHTML = /*modal_email_policy*/ ctx[8];
    			append_hydration(div2, t4);
    			append_hydration(div2, div0);
    			append_hydration(div0, t5);
    			append_hydration(div2, t6);
    			append_hydration(div2, div1);
    			append_hydration(div1, t7);
    			append_hydration(div1, t8);
    			if (if_block) if_block.m(div1, null);
    			append_hydration(div2, t9);
    			append_hydration(div2, svg);
    			append_hydration(svg, path0);
    			append_hydration(svg, path1);
    			append_hydration(svg, path2);
    			append_hydration(svg, path3);
    			append_hydration(svg, path4);
    			append_hydration(svg, path5);
    			append_hydration(svg, path6);
    			append_hydration(svg, path7);
    			append_hydration(svg, path8);
    			append_hydration(svg, path9);
    			append_hydration(svg, path10);
    			append_hydration(svg, path11);
    			append_hydration(svg, path12);
    			append_hydration(svg, path13);
    			append_hydration(svg, path14);
    			append_hydration(svg, path15);
    			append_hydration(svg, path16);
    			append_hydration(svg, path17);
    			append_hydration(svg, path18);
    			append_hydration(svg, path19);
    			append_hydration(svg, path20);
    			append_hydration(svg, path21);
    			append_hydration(svg, path22);
    			append_hydration(svg, path23);
    			append_hydration(svg, path24);
    			append_hydration(svg, path25);
    			append_hydration(svg, path26);
    			append_hydration(svg, path27);

    			if (!mounted) {
    				dispose = [
    					listen(input0, "input", /*handleEmail*/ ctx[50]),
    					listen(input0, "change", /*handleEmail*/ ctx[50]),
    					listen(input0, "input", /*input0_input_handler*/ ctx[70]),
    					listen(input1, "change", /*handleAgree*/ ctx[51]),
    					listen(input1, "change", /*input1_change_handler*/ ctx[71]),
    					listen(div1, "click", /*handSubscribe*/ ctx[52])
    				];

    				mounted = true;
    			}
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*modal_title*/ 64) h3.innerHTML = /*modal_title*/ ctx[6];
    			if (dirty[0] & /*modal_email*/ 128) {
    				attr(input0, "placeholder", /*modal_email*/ ctx[7]);
    			}

    			if (dirty[1] & /*subscribe_email*/ 2 && input0.value !== /*subscribe_email*/ ctx[32]) {
    				set_input_value(input0, /*subscribe_email*/ ctx[32]);
    			}

    			if (dirty[1] & /*subscribe_agree*/ 4) {
    				input1.checked = /*subscribe_agree*/ ctx[33];
    			}

    			if (dirty[0] & /*modal_email_policy*/ 256) span2.innerHTML = /*modal_email_policy*/ ctx[8];			if (dirty[1] & /*subscribe_error_txt*/ 16) set_data(t5, /*subscribe_error_txt*/ ctx[35]);

    			if (dirty[1] & /*subscribe_error*/ 8) {
    				toggle_class(div0, "active", /*subscribe_error*/ ctx[34]);
    			}

    			if (dirty[0] & /*modal_email_playnow*/ 512) set_data(t7, /*modal_email_playnow*/ ctx[9]);

    			if (/*subscribeLoading*/ ctx[37]) {
    				if (if_block) ; else {
    					if_block = create_if_block_2();
    					if_block.c();
    					if_block.m(div1, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty[1] & /*subscribeLoading*/ 64) {
    				toggle_class(div1, "loading", /*subscribeLoading*/ ctx[37]);
    			}
    		},
    		d(detaching) {
    			if (detaching) detach(div2);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};
    }

    // (337:8) 
    function create_message_slot(ctx) {
    	let current;
    	const message_slot_template = /*#slots*/ ctx[63].message;
    	const message_slot = create_slot(message_slot_template, ctx, /*$$scope*/ ctx[73], get_message_slot_context_1);
    	const message_slot_or_fallback = message_slot || fallback_block(ctx);

    	return {
    		c() {
    			if (message_slot_or_fallback) message_slot_or_fallback.c();
    		},
    		l(nodes) {
    			if (message_slot_or_fallback) message_slot_or_fallback.l(nodes);
    		},
    		m(target, anchor) {
    			if (message_slot_or_fallback) {
    				message_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p(ctx, dirty) {
    			if (message_slot) {
    				if (message_slot.p && (!current || dirty[2] & /*$$scope*/ 2048)) {
    					update_slot_base(
    						message_slot,
    						message_slot_template,
    						ctx,
    						/*$$scope*/ ctx[73],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[73])
    						: get_slot_changes(message_slot_template, /*$$scope*/ ctx[73], dirty, get_message_slot_changes_1),
    						get_message_slot_context_1
    					);
    				}
    			} else {
    				if (message_slot_or_fallback && message_slot_or_fallback.p && (!current || dirty[0] & /*modal_email_playnow, modal_email_policy, modal_email, modal_title*/ 960 | dirty[1] & /*subscribeLoading, subscribe_error, subscribe_error_txt, subscribe_agree, subscribe_email*/ 94)) {
    					message_slot_or_fallback.p(ctx, !current ? [-1, -1, -1] : dirty);
    				}
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(message_slot_or_fallback, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(message_slot_or_fallback, local);
    			current = false;
    		},
    		d(detaching) {
    			if (message_slot_or_fallback) message_slot_or_fallback.d(detaching);
    		}
    	};
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*validated*/ ctx[31] && create_if_block(ctx);

    	return {
    		c() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p(ctx, dirty) {
    			if (/*validated*/ ctx[31]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[1] & /*validated*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach(if_block_anchor);
    		}
    	};
    }

    function verifyEmail(str) {
    	const reg = /^[A-Za-z0-9._%+!`#$^-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,8}$/;
    	return reg.test(str);
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let focusedCell;
    	let cellIndexMap;
    	let percentCorrect;
    	let isComplete;
    	let isDisableHighlight;
    	let stacked;
    	let inlineStyles;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	let { data = [] } = $$props;
    	let { actions = ["clear", "reveal", "check"] } = $$props;
    	let { theme = "classic" } = $$props;
    	let { revealDuration = 1000 } = $$props;
    	let { breakpoint = 720 } = $$props;
    	let { revealed = false } = $$props;
    	let { disableHighlight = false } = $$props;
    	let { showCompleteMessage = true } = $$props;
    	let { showConfetti = true } = $$props;
    	let { showKeyboard } = $$props;
    	let { keyboardStyle = "outline" } = $$props;
    	let { modal_title = "" } = $$props;
    	let { modal_email = "Email" } = $$props;
    	let { modal_email_empty = "Please enter a valid email address." } = $$props;
    	let { modal_email_error = "The email must be a valid email address." } = $$props;
    	let { modal_email_noagree = "Please agree to the Terms of Service and Privacy policy." } = $$props;
    	let { modal_email_policy = "" } = $$props;
    	let { modal_email_playnow = "PLAY NOW" } = $$props;
    	let { modal_correct_words } = $$props;
    	let { modal_incorrect_words } = $$props;
    	let { btn_reset } = $$props;
    	let { btn_check } = $$props;
    	let { success_title } = $$props;
    	let { success_couponinfo } = $$props;
    	let { success_copy } = $$props;
    	let { success_des } = $$props;
    	let { shopurl } = $$props;
    	let { setting_id } = $$props;

    	// lang 配置文案
    	let checkModal = false;

    	let error_num = 0;
    	let correct_num = 0;
    	let width = 0;
    	let focusedDirection = "across";
    	let focusedCellIndex = 0;
    	let isRevealing = false;
    	let isLoaded = false;
    	let isChecking = false;
    	let revealTimeout;
    	let originalClues = [];
    	let validated = [];
    	let clues = [];
    	let cells = [];

    	// 订阅相关
    	let isSubscribe = window.sessionStorage.getItem("__jky_cwd") || false;

    	let subscribe_email = '';
    	let subscribe_agree = false;
    	let subscribe_error = false;
    	let subscribe_error_txt = '';
    	let subscribeModalClose = false;
    	let subscribeLoading = false;
    	let coupons_api_error = "";
    	let coupons_code = "";

    	const onDataUpdate = () => {
    		originalClues = createClues(data);
    		$$invalidate(31, validated = validateClues(originalClues));
    		$$invalidate(21, clues = originalClues.map(d => ({ ...d })));
    		$$invalidate(22, cells = createCells(originalClues));
    		reset();
    	};

    	onMount(async () => {
    		$$invalidate(29, isLoaded = true);
    		await tick();
    		document.querySelector(".crossword-section #crossword__discount") && (document.querySelector("#crossword_subscribe_discount").innerText = document.querySelector(".crossword-section #crossword__discount")?.innerText);
    	});

    	function checkClues() {
    		return clues.map(d => {
    			d.index;

    			const cellChecks = d.cells.map(c => {
    				const { value } = cells.find(e => e.id === c.id);
    				const hasValue = !!value;
    				const hasCorrect = value === c.answer;
    				const isError = value && value !== c.answer;
    				return { hasValue, hasCorrect, isError };
    			});

    			const isCorrect = cellChecks.filter(c => c.hasCorrect).length === d.answer.length;
    			const hasError = cellChecks.filter(c => c.isError).length > 0;
    			return { ...d, isCorrect, hasError };
    		});
    	}

    	function getCheckRes() {
    		// 返回错误 and 正确的单词数量
    		const list = checkClues();

    		return {
    			error: list.filter(item => {
    				return item.hasError;
    			}),
    			correct: list.filter(item => {
    				return item.isCorrect;
    			})
    		};
    	}

    	function reset() {
    		$$invalidate(28, isRevealing = false);
    		$$invalidate(30, isChecking = false);
    		$$invalidate(20, focusedCellIndex = 0);
    		$$invalidate(27, focusedDirection = "across");
    	}

    	function onClear() {
    		reset();
    		if (revealTimeout) clearTimeout(revealTimeout);

    		$$invalidate(22, cells = cells.map(cell => ({
    			...cell,
    			value: cell.show ? cell.answer : ""
    		})));
    	}

    	function onReveal() {
    		if (revealed) return true;
    		reset();
    		$$invalidate(22, cells = cells.map(cell => ({ ...cell, value: cell.answer })));
    		startReveal();
    	}

    	function onCheck() {
    		$$invalidate(30, isChecking = true);
    		const res = getCheckRes() || { error: '', correct: '' };
    		$$invalidate(25, error_num = res.error.length);
    		$$invalidate(26, correct_num = res.correct.length);
    		$$invalidate(24, checkModal = true);

    		setTimeout(
    			() => {
    				$$invalidate(30, isChecking = false);
    				$$invalidate(24, checkModal = false);
    			},
    			3500
    		);
    	}

    	function startReveal() {
    		$$invalidate(28, isRevealing = true);
    		$$invalidate(30, isChecking = false);
    		if (revealTimeout) clearTimeout(revealTimeout);

    		revealTimeout = setTimeout(
    			() => {
    				$$invalidate(28, isRevealing = false);
    			},
    			revealDuration + 250
    		);
    	}

    	function onToolbarEvent({ detail }) {
    		if (detail === "clear") onClear(); else if (detail === "reveal") onReveal(); else if (detail === "check") onCheck();
    	}

    	function handleEmail() {
    		if (!verifyEmail(subscribe_email)) {
    			$$invalidate(34, subscribe_error = true);

    			$$invalidate(35, subscribe_error_txt = subscribe_email === ""
    			? modal_email_empty
    			: modal_email_error);
    		} else {
    			$$invalidate(34, subscribe_error = false);
    			$$invalidate(35, subscribe_error_txt = '');
    			handleAgree();
    		}

    		return !verifyEmail(subscribe_email);
    	}

    	function handleAgree() {
    		setTimeout(
    			() => {
    				if (!subscribe_agree) {
    					$$invalidate(34, subscribe_error = true);
    					$$invalidate(35, subscribe_error_txt = modal_email_noagree);
    				} else {
    					$$invalidate(34, subscribe_error = false);
    					$$invalidate(35, subscribe_error_txt = '');
    					handleEmail();
    				}
    			},
    			0
    		);
    	}

    	function handSubscribe() {
    		handleEmail();
    		handleAgree();

    		setTimeout(
    			() => {
    				if (!subscribe_error) {
    					$$invalidate(37, subscribeLoading = true);

    					footerPhoneSubs({ email: subscribe_email, tags: "CP_games" }).then(() => {
    						$$invalidate(36, subscribeModalClose = true);
    						$$invalidate(37, subscribeLoading = false);
    						window.sessionStorage.setItem("__jky_cwd", '1');
    						window.sessionStorage.setItem("__jky_cwd_email", subscribe_email);
    						handleGameGTM({ button_name: modal_email_playnow });
    					}).catch(e => {
    						$$invalidate(35, subscribe_error_txt = e.message || 'Server Error, please try again later.');
    						$$invalidate(37, subscribeLoading = false);
    					});
    				}
    			},
    			10
    		);
    	}

    	function handleComplete() {
    		const email = window.sessionStorage.getItem("__jky_cwd_email") || false;
    		if (!isComplete || !email) return;

    		createCoupons({ email, settingId: setting_id }).then(res => {
    			$$invalidate(39, coupons_code = res.data);
    		}).catch(e => {
    			$$invalidate(38, coupons_api_error = e.message === "Faield to fetch"
    			? "Coupon unavailable, please try again later."
    			: e.message);
    		});
    	}

    	function clues_1_focusedCellIndex_binding(value) {
    		focusedCellIndex = value;
    		$$invalidate(20, focusedCellIndex);
    	}

    	function clues_1_focusedCell_binding(value) {
    		focusedCell = value;
    		(($$invalidate(44, focusedCell), $$invalidate(22, cells)), $$invalidate(20, focusedCellIndex));
    	}

    	function clues_1_focusedDirection_binding(value) {
    		focusedDirection = value;
    		$$invalidate(27, focusedDirection);
    	}

    	function puzzle_cells_binding(value) {
    		cells = value;
    		$$invalidate(22, cells);
    	}

    	function puzzle_focusedCellIndex_binding(value) {
    		focusedCellIndex = value;
    		$$invalidate(20, focusedCellIndex);
    	}

    	function puzzle_focusedDirection_binding(value) {
    		focusedDirection = value;
    		$$invalidate(27, focusedDirection);
    	}

    	function input0_input_handler() {
    		subscribe_email = this.value;
    		$$invalidate(32, subscribe_email);
    	}

    	function input1_change_handler() {
    		subscribe_agree = this.checked;
    		$$invalidate(33, subscribe_agree);
    	}

    	function article_elementresize_handler() {
    		width = this.offsetWidth;
    		$$invalidate(19, width);
    	}

    	$$self.$$set = $$props => {
    		if ('data' in $$props) $$invalidate(54, data = $$props.data);
    		if ('actions' in $$props) $$invalidate(0, actions = $$props.actions);
    		if ('theme' in $$props) $$invalidate(55, theme = $$props.theme);
    		if ('revealDuration' in $$props) $$invalidate(1, revealDuration = $$props.revealDuration);
    		if ('breakpoint' in $$props) $$invalidate(56, breakpoint = $$props.breakpoint);
    		if ('revealed' in $$props) $$invalidate(53, revealed = $$props.revealed);
    		if ('disableHighlight' in $$props) $$invalidate(57, disableHighlight = $$props.disableHighlight);
    		if ('showCompleteMessage' in $$props) $$invalidate(2, showCompleteMessage = $$props.showCompleteMessage);
    		if ('showConfetti' in $$props) $$invalidate(3, showConfetti = $$props.showConfetti);
    		if ('showKeyboard' in $$props) $$invalidate(4, showKeyboard = $$props.showKeyboard);
    		if ('keyboardStyle' in $$props) $$invalidate(5, keyboardStyle = $$props.keyboardStyle);
    		if ('modal_title' in $$props) $$invalidate(6, modal_title = $$props.modal_title);
    		if ('modal_email' in $$props) $$invalidate(7, modal_email = $$props.modal_email);
    		if ('modal_email_empty' in $$props) $$invalidate(58, modal_email_empty = $$props.modal_email_empty);
    		if ('modal_email_error' in $$props) $$invalidate(59, modal_email_error = $$props.modal_email_error);
    		if ('modal_email_noagree' in $$props) $$invalidate(60, modal_email_noagree = $$props.modal_email_noagree);
    		if ('modal_email_policy' in $$props) $$invalidate(8, modal_email_policy = $$props.modal_email_policy);
    		if ('modal_email_playnow' in $$props) $$invalidate(9, modal_email_playnow = $$props.modal_email_playnow);
    		if ('modal_correct_words' in $$props) $$invalidate(10, modal_correct_words = $$props.modal_correct_words);
    		if ('modal_incorrect_words' in $$props) $$invalidate(11, modal_incorrect_words = $$props.modal_incorrect_words);
    		if ('btn_reset' in $$props) $$invalidate(12, btn_reset = $$props.btn_reset);
    		if ('btn_check' in $$props) $$invalidate(13, btn_check = $$props.btn_check);
    		if ('success_title' in $$props) $$invalidate(14, success_title = $$props.success_title);
    		if ('success_couponinfo' in $$props) $$invalidate(15, success_couponinfo = $$props.success_couponinfo);
    		if ('success_copy' in $$props) $$invalidate(16, success_copy = $$props.success_copy);
    		if ('success_des' in $$props) $$invalidate(17, success_des = $$props.success_des);
    		if ('shopurl' in $$props) $$invalidate(18, shopurl = $$props.shopurl);
    		if ('setting_id' in $$props) $$invalidate(61, setting_id = $$props.setting_id);
    		if ('$$scope' in $$props) $$invalidate(73, $$scope = $$props.$$scope);
    	};

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[1] & /*data*/ 8388608) {
    			(onDataUpdate());
    		}

    		if ($$self.$$.dirty[0] & /*cells, focusedCellIndex*/ 5242880) {
    			$$invalidate(44, focusedCell = cells[focusedCellIndex] || {});
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 4194304) {
    			$$invalidate(43, cellIndexMap = fromPairs(cells.map(cell => [cell.id, cell.index])));
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 4194304) {
    			$$invalidate(62, percentCorrect = cells.filter(d => d.answer === d.value).length / cells.length);
    		}

    		if ($$self.$$.dirty[2] & /*percentCorrect*/ 1) {
    			$$invalidate(23, isComplete = percentCorrect == 1);
    		}

    		if ($$self.$$.dirty[0] & /*isComplete*/ 8388608 | $$self.$$.dirty[1] & /*disableHighlight*/ 67108864) {
    			$$invalidate(42, isDisableHighlight = isComplete && disableHighlight);
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 4194304) {
    			($$invalidate(21, clues = checkClues()));
    		}

    		if ($$self.$$.dirty[0] & /*cells, clues*/ 6291456) {
    			($$invalidate(53, revealed = !clues.filter(d => !d.isCorrect).length));
    		}

    		if ($$self.$$.dirty[0] & /*width*/ 524288 | $$self.$$.dirty[1] & /*breakpoint*/ 33554432) {
    			$$invalidate(41, stacked = width < breakpoint);
    		}

    		if ($$self.$$.dirty[1] & /*theme*/ 16777216) {
    			$$invalidate(40, inlineStyles = themes[theme]);
    		}

    		if ($$self.$$.dirty[0] & /*isComplete*/ 8388608) {
    			(handleComplete());
    		}
    	};

    	return [
    		actions,
    		revealDuration,
    		showCompleteMessage,
    		showConfetti,
    		showKeyboard,
    		keyboardStyle,
    		modal_title,
    		modal_email,
    		modal_email_policy,
    		modal_email_playnow,
    		modal_correct_words,
    		modal_incorrect_words,
    		btn_reset,
    		btn_check,
    		success_title,
    		success_couponinfo,
    		success_copy,
    		success_des,
    		shopurl,
    		width,
    		focusedCellIndex,
    		clues,
    		cells,
    		isComplete,
    		checkModal,
    		error_num,
    		correct_num,
    		focusedDirection,
    		isRevealing,
    		isLoaded,
    		isChecking,
    		validated,
    		subscribe_email,
    		subscribe_agree,
    		subscribe_error,
    		subscribe_error_txt,
    		subscribeModalClose,
    		subscribeLoading,
    		coupons_api_error,
    		coupons_code,
    		inlineStyles,
    		stacked,
    		isDisableHighlight,
    		cellIndexMap,
    		focusedCell,
    		isSubscribe,
    		onClear,
    		onReveal,
    		onCheck,
    		onToolbarEvent,
    		handleEmail,
    		handleAgree,
    		handSubscribe,
    		revealed,
    		data,
    		theme,
    		breakpoint,
    		disableHighlight,
    		modal_email_empty,
    		modal_email_error,
    		modal_email_noagree,
    		setting_id,
    		percentCorrect,
    		slots,
    		clues_1_focusedCellIndex_binding,
    		clues_1_focusedCell_binding,
    		clues_1_focusedDirection_binding,
    		puzzle_cells_binding,
    		puzzle_focusedCellIndex_binding,
    		puzzle_focusedDirection_binding,
    		input0_input_handler,
    		input1_change_handler,
    		article_elementresize_handler,
    		$$scope
    	];
    }

    class Crossword extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(
    			this,
    			options,
    			instance$1,
    			create_fragment$1,
    			safe_not_equal,
    			{
    				data: 54,
    				actions: 0,
    				theme: 55,
    				revealDuration: 1,
    				breakpoint: 56,
    				revealed: 53,
    				disableHighlight: 57,
    				showCompleteMessage: 2,
    				showConfetti: 3,
    				showKeyboard: 4,
    				keyboardStyle: 5,
    				modal_title: 6,
    				modal_email: 7,
    				modal_email_empty: 58,
    				modal_email_error: 59,
    				modal_email_noagree: 60,
    				modal_email_policy: 8,
    				modal_email_playnow: 9,
    				modal_correct_words: 10,
    				modal_incorrect_words: 11,
    				btn_reset: 12,
    				btn_check: 13,
    				success_title: 14,
    				success_couponinfo: 15,
    				success_copy: 16,
    				success_des: 17,
    				shopurl: 18,
    				setting_id: 61
    			},
    			null,
    			[-1, -1, -1]
    		);
    	}
    }

    var jac = [
    	{
    		clue: "露营帐篷",
    		answer: "Camping",
    		direction: "across",
    		x: 11,
    		y: 4,
    		uncheck: [
    			1,
    			2
    		]
    	},
    	{
    		clue: "NO.1",
    		answer: "GlobalLeadingBrand",
    		direction: "across",
    		x: 0,
    		y: 6,
    		uncheck: [
    			1,
    			2,
    			3,
    			4,
    			5,
    			6,
    			9,
    			13,
    			14,
    			15,
    			16,
    			17,
    			18
    		]
    	},
    	{
    		clue: "电池护盾",
    		answer: "Chargeshield",
    		direction: "across",
    		x: 6,
    		y: 1,
    		uncheck: [
    			1,
    			3,
    			7
    		]
    	},
    	{
    		clue: "电池快充",
    		answer: "Fastcharging",
    		direction: "down",
    		x: 8,
    		y: 0,
    		uncheck: [
    			1,
    			5,
    			6,
    			7,
    			8,
    			9,
    			10,
    			11,
    			12
    		]
    	},
    	{
    		clue: "家庭",
    		answer: "Homebackup",
    		direction: "down",
    		x: 3,
    		y: 2,
    		uncheck: [
    			1,
    			2,
    			5,
    			6,
    			7,
    			8,
    			9,
    			10
    		]
    	},
    	{
    		clue: "Jackery产品",
    		answer: "SolarGenerator",
    		direction: "down",
    		x: 12,
    		y: 1,
    		uncheck: [
    			1,
    			2,
    			3,
    			4,
    			5,
    			6
    		]
    	}
    ];

    /* App.svelte generated by Svelte v3.59.2 */

    function create_fragment(ctx) {
    	let article;
    	let section;
    	let crossword;
    	let current;

    	crossword = new Crossword({
    			props: {
    				modal_title: /*modal_title*/ ctx[0],
    				modal_email: /*modal_email*/ ctx[1],
    				modal_email_empty: /*modal_email_empty*/ ctx[2],
    				modal_email_error: /*modal_email_error*/ ctx[3],
    				modal_email_noagree: /*modal_email_noagree*/ ctx[4],
    				modal_email_policy: /*modal_email_policy*/ ctx[5],
    				modal_email_playnow: /*modal_email_playnow*/ ctx[6],
    				modal_correct_words: /*modal_correct_words*/ ctx[7],
    				modal_incorrect_words: /*modal_incorrect_words*/ ctx[8],
    				btn_reset: /*btn_reset*/ ctx[9],
    				btn_check: /*btn_check*/ ctx[10],
    				success_title: /*success_title*/ ctx[11],
    				success_couponinfo: /*success_couponinfo*/ ctx[12],
    				success_copy: /*success_copy*/ ctx[13],
    				success_des: /*success_des*/ ctx[14],
    				shopurl: /*shopurl*/ ctx[15],
    				setting_id: /*setting_id*/ ctx[16],
    				data: jac
    			}
    		});

    	return {
    		c() {
    			article = element("article");
    			section = element("section");
    			create_component(crossword.$$.fragment);
    			this.h();
    		},
    		l(nodes) {
    			article = claim_element(nodes, "ARTICLE", { class: true });
    			var article_nodes = children(article);
    			section = claim_element(article_nodes, "SECTION", { id: true, class: true });
    			var section_nodes = children(section);
    			claim_component(crossword.$$.fragment, section_nodes);
    			section_nodes.forEach(detach);
    			article_nodes.forEach(detach);
    			this.h();
    		},
    		h() {
    			attr(section, "id", "default");
    			attr(section, "class", "svelte-1lk4vsn");
    			attr(article, "class", "svelte-1lk4vsn");
    		},
    		m(target, anchor) {
    			insert_hydration(target, article, anchor);
    			append_hydration(article, section);
    			mount_component(crossword, section, null);
    			current = true;
    		},
    		p(ctx, [dirty]) {
    			const crossword_changes = {};
    			if (dirty & /*modal_title*/ 1) crossword_changes.modal_title = /*modal_title*/ ctx[0];
    			if (dirty & /*modal_email*/ 2) crossword_changes.modal_email = /*modal_email*/ ctx[1];
    			if (dirty & /*modal_email_empty*/ 4) crossword_changes.modal_email_empty = /*modal_email_empty*/ ctx[2];
    			if (dirty & /*modal_email_error*/ 8) crossword_changes.modal_email_error = /*modal_email_error*/ ctx[3];
    			if (dirty & /*modal_email_noagree*/ 16) crossword_changes.modal_email_noagree = /*modal_email_noagree*/ ctx[4];
    			if (dirty & /*modal_email_policy*/ 32) crossword_changes.modal_email_policy = /*modal_email_policy*/ ctx[5];
    			if (dirty & /*modal_email_playnow*/ 64) crossword_changes.modal_email_playnow = /*modal_email_playnow*/ ctx[6];
    			if (dirty & /*modal_correct_words*/ 128) crossword_changes.modal_correct_words = /*modal_correct_words*/ ctx[7];
    			if (dirty & /*modal_incorrect_words*/ 256) crossword_changes.modal_incorrect_words = /*modal_incorrect_words*/ ctx[8];
    			if (dirty & /*btn_reset*/ 512) crossword_changes.btn_reset = /*btn_reset*/ ctx[9];
    			if (dirty & /*btn_check*/ 1024) crossword_changes.btn_check = /*btn_check*/ ctx[10];
    			if (dirty & /*success_title*/ 2048) crossword_changes.success_title = /*success_title*/ ctx[11];
    			if (dirty & /*success_couponinfo*/ 4096) crossword_changes.success_couponinfo = /*success_couponinfo*/ ctx[12];
    			if (dirty & /*success_copy*/ 8192) crossword_changes.success_copy = /*success_copy*/ ctx[13];
    			if (dirty & /*success_des*/ 16384) crossword_changes.success_des = /*success_des*/ ctx[14];
    			if (dirty & /*shopurl*/ 32768) crossword_changes.shopurl = /*shopurl*/ ctx[15];
    			if (dirty & /*setting_id*/ 65536) crossword_changes.setting_id = /*setting_id*/ ctx[16];
    			crossword.$set(crossword_changes);
    		},
    		i(local) {
    			if (current) return;
    			transition_in(crossword.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(crossword.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(article);
    			destroy_component(crossword);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { modal_title } = $$props;
    	let { modal_email } = $$props;
    	let { modal_email_empty } = $$props;
    	let { modal_email_error } = $$props;
    	let { modal_email_noagree } = $$props;
    	let { modal_email_policy } = $$props;
    	let { modal_email_playnow } = $$props;
    	let { modal_correct_words } = $$props;
    	let { modal_incorrect_words } = $$props;
    	let { btn_reset } = $$props;
    	let { btn_check } = $$props;
    	let { success_title } = $$props;
    	let { success_couponinfo } = $$props;
    	let { success_copy } = $$props;
    	let { success_des } = $$props;
    	let { shopurl } = $$props;
    	let { setting_id } = $$props;

    	window.fbAsyncInit = function () {
    		FB.init({
    			appId: '855600322936840',
    			xfbml: true,
    			version: 'v2.9'
    		});

    		FB.AppEvents.logPageView();
    	};

    	$$self.$$set = $$props => {
    		if ('modal_title' in $$props) $$invalidate(0, modal_title = $$props.modal_title);
    		if ('modal_email' in $$props) $$invalidate(1, modal_email = $$props.modal_email);
    		if ('modal_email_empty' in $$props) $$invalidate(2, modal_email_empty = $$props.modal_email_empty);
    		if ('modal_email_error' in $$props) $$invalidate(3, modal_email_error = $$props.modal_email_error);
    		if ('modal_email_noagree' in $$props) $$invalidate(4, modal_email_noagree = $$props.modal_email_noagree);
    		if ('modal_email_policy' in $$props) $$invalidate(5, modal_email_policy = $$props.modal_email_policy);
    		if ('modal_email_playnow' in $$props) $$invalidate(6, modal_email_playnow = $$props.modal_email_playnow);
    		if ('modal_correct_words' in $$props) $$invalidate(7, modal_correct_words = $$props.modal_correct_words);
    		if ('modal_incorrect_words' in $$props) $$invalidate(8, modal_incorrect_words = $$props.modal_incorrect_words);
    		if ('btn_reset' in $$props) $$invalidate(9, btn_reset = $$props.btn_reset);
    		if ('btn_check' in $$props) $$invalidate(10, btn_check = $$props.btn_check);
    		if ('success_title' in $$props) $$invalidate(11, success_title = $$props.success_title);
    		if ('success_couponinfo' in $$props) $$invalidate(12, success_couponinfo = $$props.success_couponinfo);
    		if ('success_copy' in $$props) $$invalidate(13, success_copy = $$props.success_copy);
    		if ('success_des' in $$props) $$invalidate(14, success_des = $$props.success_des);
    		if ('shopurl' in $$props) $$invalidate(15, shopurl = $$props.shopurl);
    		if ('setting_id' in $$props) $$invalidate(16, setting_id = $$props.setting_id);
    	};

    	return [
    		modal_title,
    		modal_email,
    		modal_email_empty,
    		modal_email_error,
    		modal_email_noagree,
    		modal_email_policy,
    		modal_email_playnow,
    		modal_correct_words,
    		modal_incorrect_words,
    		btn_reset,
    		btn_check,
    		success_title,
    		success_couponinfo,
    		success_copy,
    		success_des,
    		shopurl,
    		setting_id
    	];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			modal_title: 0,
    			modal_email: 1,
    			modal_email_empty: 2,
    			modal_email_error: 3,
    			modal_email_noagree: 4,
    			modal_email_policy: 5,
    			modal_email_playnow: 6,
    			modal_correct_words: 7,
    			modal_incorrect_words: 8,
    			btn_reset: 9,
    			btn_check: 10,
    			success_title: 11,
    			success_couponinfo: 12,
    			success_copy: 13,
    			success_des: 14,
    			shopurl: 15,
    			setting_id: 16
    		});
    	}
    }

    const _dom = document.querySelector(".crossword-main");

    const app = new App({
    	target: document.querySelector(".crossword-main"),
    	hydrate: true,
    	props: {
    		modal_title: _dom.getAttribute("data-modal-title"),
    		modal_email: _dom.getAttribute("data-modal-email"),
    		modal_email_empty: _dom.getAttribute("data-modal-emailEmpty"),
    		modal_email_error: _dom.getAttribute("data-modal-emailError"),
    		modal_email_noagree: _dom.getAttribute("data-modal-notagree"),
    		modal_email_policy: _dom.getAttribute("data-modal-policy"),
    		modal_email_playnow: _dom.getAttribute("data-modal-playnow"),
    		modal_correct_words: _dom.getAttribute("data-correct_words"),
    		modal_incorrect_words: _dom.getAttribute("data-incorrect_words"),
    		btn_reset: _dom.getAttribute("data-btn_reset"),
    		btn_check: _dom.getAttribute("data-btn_check"),
    		success_title: _dom.getAttribute("data-success_title"),
    		success_couponinfo: _dom.getAttribute("data-success_couponinfo"),
    		success_copy: _dom.getAttribute("data-success_copy"),
    		success_des: _dom.getAttribute("data-success_des"),
    		shopurl: _dom.getAttribute("data-shopurl"),
    		setting_id: _dom.getAttribute("data-setting_id"),
    	}
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
