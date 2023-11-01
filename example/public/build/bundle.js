
(function(l, r) { if (!l || l.getElementById('livereloadscript')) return; r = l.createElement('script'); r.async = 1; r.src = '//' + (self.location.host || 'localhost').split(':')[0] + ':35729/livereload.js?snipver=1'; r.id = 'livereloadscript'; l.getElementsByTagName('head')[0].appendChild(r) })(self.document);
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
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
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

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);

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

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.59.2' }, detail), { bubbles: true }));
    }
    function append_hydration_dev(target, node) {
        dispatch_dev('SvelteDOMInsert', { target, node });
        append_hydration(target, node);
    }
    function insert_hydration_dev(target, node, anchor) {
        dispatch_dev('SvelteDOMInsert', { target, node, anchor });
        insert_hydration(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev('SvelteDOMRemove', { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation, has_stop_immediate_propagation) {
        const modifiers = options === true ? ['capture'] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        if (has_stop_immediate_propagation)
            modifiers.push('stopImmediatePropagation');
        dispatch_dev('SvelteDOMAddEventListener', { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev('SvelteDOMRemoveEventListener', { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev('SvelteDOMRemoveAttribute', { node, attribute });
        else
            dispatch_dev('SvelteDOMSetAttribute', { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.data === data)
            return;
        dispatch_dev('SvelteDOMSetData', { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    /**
     * Base class for Svelte components with some minor dev-enhancements. Used when dev=true.
     */
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error("'target' is a required option");
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn('Component was already destroyed'); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Toolbar.svelte generated by Svelte v3.59.2 */
    const file$b = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\Toolbar.svelte";

    function get_each_context$5(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[5] = list[i];
    	return child_ctx;
    }

    // (14:33) 
    function create_if_block_2$2(ctx) {
    	let button;
    	let t;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			t = text("Check");
    			this.h();
    		},
    		l: function claim(nodes) {
    			button = claim_element(nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);
    			t = claim_text(button_nodes, "Check");
    			button_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(button, "class", "svelte-1awe1n5");
    			add_location(button, file$b, 14, 6, 474);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, button, anchor);
    			append_hydration_dev(button, t);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler_2*/ ctx[4], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$2.name,
    		type: "if",
    		source: "(14:33) ",
    		ctx
    	});

    	return block;
    }

    // (12:34) 
    function create_if_block_1$3(ctx) {
    	let button;
    	let t;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			t = text("Reveal");
    			this.h();
    		},
    		l: function claim(nodes) {
    			button = claim_element(nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);
    			t = claim_text(button_nodes, "Reveal");
    			button_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(button, "class", "svelte-1awe1n5");
    			add_location(button, file$b, 12, 6, 363);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, button, anchor);
    			append_hydration_dev(button, t);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler_1*/ ctx[3], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$3.name,
    		type: "if",
    		source: "(12:34) ",
    		ctx
    	});

    	return block;
    }

    // (10:4) {#if action === 'clear'}
    function create_if_block$5(ctx) {
    	let button;
    	let t;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			t = text("Reset");
    			this.h();
    		},
    		l: function claim(nodes) {
    			button = claim_element(nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);
    			t = claim_text(button_nodes, "Reset");
    			button_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(button, "class", "svelte-1awe1n5");
    			add_location(button, file$b, 10, 6, 253);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, button, anchor);
    			append_hydration_dev(button, t);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*click_handler*/ ctx[2], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$5.name,
    		type: "if",
    		source: "(10:4) {#if action === 'clear'}",
    		ctx
    	});

    	return block;
    }

    // (9:2) {#each actions as action}
    function create_each_block$5(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*action*/ ctx[5] === 'clear') return create_if_block$5;
    		if (/*action*/ ctx[5] === 'reveal') return create_if_block_1$3;
    		if (/*action*/ ctx[5] === 'check') return create_if_block_2$2;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type && current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
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
    		d: function destroy(detaching) {
    			if (if_block) {
    				if_block.d(detaching);
    			}

    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$5.name,
    		type: "each",
    		source: "(9:2) {#each actions as action}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$b(ctx) {
    	let div;
    	let each_value = /*actions*/ ctx[0];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$5(get_each_context$5(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div_nodes);
    			}

    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div, "class", "toolbar svelte-1awe1n5");
    			add_location(div, file$b, 7, 0, 168);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div, null);
    				}
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*dispatch, actions*/ 3) {
    				each_value = /*actions*/ ctx[0];
    				validate_each_argument(each_value);
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
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$b.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$b($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Toolbar', slots, []);
    	const dispatch = createEventDispatcher();
    	let { actions = ["clear", "reveal", "check"] } = $$props;
    	const writable_props = ['actions'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Toolbar> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => dispatch('event', 'clear');
    	const click_handler_1 = () => dispatch('event', 'reveal');
    	const click_handler_2 = () => dispatch('event', 'check');

    	$$self.$$set = $$props => {
    		if ('actions' in $$props) $$invalidate(0, actions = $$props.actions);
    	};

    	$$self.$capture_state = () => ({ createEventDispatcher, dispatch, actions });

    	$$self.$inject_state = $$props => {
    		if ('actions' in $$props) $$invalidate(0, actions = $$props.actions);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [actions, dispatch, click_handler, click_handler_1, click_handler_2];
    }

    class Toolbar extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$b, create_fragment$b, safe_not_equal, { actions: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Toolbar",
    			options,
    			id: create_fragment$b.name
    		});
    	}

    	get actions() {
    		throw new Error("<Toolbar>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set actions(value) {
    		throw new Error("<Toolbar>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
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
    const file$a = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\node_modules\\svelte-keyboard\\src\\Keyboard.svelte";

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

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		l: function claim(nodes) {
    			t = claim_text(nodes, t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*rowData*/ 8 && t_value !== (t_value = /*display*/ ctx[32] + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(93:14) {:else}",
    		ctx
    	});

    	return block;
    }

    // (91:14) {#if display.includes('<svg')}
    function create_if_block$4(ctx) {
    	let html_tag;
    	let raw_value = /*display*/ ctx[32] + "";
    	let html_anchor;

    	const block = {
    		c: function create() {
    			html_tag = new HtmlTagHydration(false);
    			html_anchor = empty();
    			this.h();
    		},
    		l: function claim(nodes) {
    			html_tag = claim_html_tag(nodes, false);
    			html_anchor = empty();
    			this.h();
    		},
    		h: function hydrate() {
    			html_tag.a = html_anchor;
    		},
    		m: function mount(target, anchor) {
    			html_tag.m(raw_value, target, anchor);
    			insert_hydration_dev(target, html_anchor, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*rowData*/ 8 && raw_value !== (raw_value = /*display*/ ctx[32] + "")) html_tag.p(raw_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(html_anchor);
    			if (detaching) html_tag.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$4.name,
    		type: "if",
    		source: "(91:14) {#if display.includes('<svg')}",
    		ctx
    	});

    	return block;
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

    	const block = {
    		c: function create() {
    			button = element("button");
    			if_block.c();
    			this.h();
    		},
    		l: function claim(nodes) {
    			button = claim_element(nodes, "BUTTON", { style: true, class: true });
    			var button_nodes = children(button);
    			if_block.l(button_nodes);
    			button_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			set_style(button, "--w", /*percentWidth*/ ctx[2]);
    			attr_dev(button, "class", button_class_value = "" + (/*style*/ ctx[0] + " key--" + /*value*/ ctx[31] + " svelte-n3ouos"));
    			toggle_class(button, "single", /*value*/ ctx[31].length === 1);
    			add_location(button, file$a, 84, 12, 2404);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, button, anchor);
    			if_block.m(button, null);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button, "touchstart", touchstart_handler, false, false, false, false),
    					listen_dev(button, "mousedown", mousedown_handler, false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
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
    				attr_dev(button, "class", button_class_value);
    			}

    			if (dirty[0] & /*style, rowData, rowData*/ 9) {
    				toggle_class(button, "single", /*value*/ ctx[31].length === 1);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_2.name,
    		type: "each",
    		source: "(84:10) {#each keys as { value, display }}",
    		ctx
    	});

    	return block;
    }

    // (82:6) {#each row as keys}
    function create_each_block_1(ctx) {
    	let div;
    	let each_value_2 = /*keys*/ ctx[28];
    	validate_each_argument(each_value_2);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_2.length; i += 1) {
    		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div_nodes);
    			}

    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div, "class", "row row--" + /*i*/ ctx[27] + " svelte-n3ouos");
    			add_location(div, file$a, 82, 8, 2320);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div, null);
    				}
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*percentWidth, style, rowData, onKey*/ 29) {
    				each_value_2 = /*keys*/ ctx[28];
    				validate_each_argument(each_value_2);
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
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block_1.name,
    		type: "each",
    		source: "(82:6) {#each row as keys}",
    		ctx
    	});

    	return block;
    }

    // (80:2) {#each rowData as row, i}
    function create_each_block$4(ctx) {
    	let div;
    	let t;
    	let each_value_1 = /*row*/ ctx[25];
    	validate_each_argument(each_value_1);
    	let each_blocks = [];

    	for (let i = 0; i < each_value_1.length; i += 1) {
    		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t = space();
    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div_nodes);
    			}

    			t = claim_space(div_nodes);
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div, "class", "page svelte-n3ouos");
    			toggle_class(div, "visible", /*i*/ ctx[27] === /*page*/ ctx[1]);
    			add_location(div, file$a, 80, 4, 2238);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div, null);
    				}
    			}

    			append_hydration_dev(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*rowData, percentWidth, style, onKey*/ 29) {
    				each_value_1 = /*row*/ ctx[25];
    				validate_each_argument(each_value_1);
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
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$4.name,
    		type: "each",
    		source: "(80:2) {#each rowData as row, i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$a(ctx) {
    	let div;
    	let each_value = /*rowData*/ ctx[3];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$4(get_each_context$4(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(div_nodes);
    			}

    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div, "class", "keyboard");
    			add_location(div, file$a, 78, 0, 2183);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div, null);
    				}
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*page, rowData, percentWidth, style, onKey*/ 31) {
    				each_value = /*rowData*/ ctx[3];
    				validate_each_argument(each_value);
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
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$a.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
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
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Keyboard', slots, []);
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

    	$$self.$$.on_mount.push(function () {
    		if (custom === undefined && !('custom' in $$props || $$self.$$.bound[$$self.$$.props['custom']])) {
    			console.warn("<Keyboard> was created without expected prop 'custom'");
    		}
    	});

    	const writable_props = ['custom', 'style', 'layout'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Keyboard> was created with unknown prop '${key}'`);
    	});

    	const touchstart_handler = (value, e) => onKey(value, e);
    	const mousedown_handler = (value, e) => onKey(value, e);

    	$$self.$$set = $$props => {
    		if ('custom' in $$props) $$invalidate(5, custom = $$props.custom);
    		if ('style' in $$props) $$invalidate(0, style = $$props.style);
    		if ('layout' in $$props) $$invalidate(6, layout = $$props.layout);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		standard,
    		crossword,
    		backspaceSVG,
    		enterSVG,
    		dispatch,
    		custom,
    		style,
    		layout,
    		page,
    		shifted,
    		alphabet,
    		layouts,
    		swaps,
    		unique,
    		onKey,
    		maxInRow,
    		percentWidth,
    		maxInRow1,
    		maxInRow0,
    		rowData1,
    		rowData0,
    		rowData,
    		page1,
    		rows0,
    		page0,
    		rows1,
    		data,
    		rawData
    	});

    	$$self.$inject_state = $$props => {
    		if ('custom' in $$props) $$invalidate(5, custom = $$props.custom);
    		if ('style' in $$props) $$invalidate(0, style = $$props.style);
    		if ('layout' in $$props) $$invalidate(6, layout = $$props.layout);
    		if ('page' in $$props) $$invalidate(1, page = $$props.page);
    		if ('shifted' in $$props) $$invalidate(7, shifted = $$props.shifted);
    		if ('maxInRow' in $$props) $$invalidate(8, maxInRow = $$props.maxInRow);
    		if ('percentWidth' in $$props) $$invalidate(2, percentWidth = $$props.percentWidth);
    		if ('maxInRow1' in $$props) $$invalidate(9, maxInRow1 = $$props.maxInRow1);
    		if ('maxInRow0' in $$props) $$invalidate(10, maxInRow0 = $$props.maxInRow0);
    		if ('rowData1' in $$props) $$invalidate(11, rowData1 = $$props.rowData1);
    		if ('rowData0' in $$props) $$invalidate(12, rowData0 = $$props.rowData0);
    		if ('rowData' in $$props) $$invalidate(3, rowData = $$props.rowData);
    		if ('page1' in $$props) $$invalidate(13, page1 = $$props.page1);
    		if ('rows0' in $$props) $$invalidate(14, rows0 = $$props.rows0);
    		if ('page0' in $$props) $$invalidate(15, page0 = $$props.page0);
    		if ('rows1' in $$props) $$invalidate(16, rows1 = $$props.rows1);
    		if ('data' in $$props) $$invalidate(17, data = $$props.data);
    		if ('rawData' in $$props) $$invalidate(18, rawData = $$props.rawData);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

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

    class Keyboard extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$a, create_fragment$a, safe_not_equal, { custom: 5, style: 0, layout: 6 }, null, [-1, -1]);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Keyboard",
    			options,
    			id: create_fragment$a.name
    		});
    	}

    	get custom() {
    		throw new Error("<Keyboard>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set custom(value) {
    		throw new Error("<Keyboard>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get style() {
    		throw new Error("<Keyboard>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set style(value) {
    		throw new Error("<Keyboard>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get layout() {
    		throw new Error("<Keyboard>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set layout(value) {
    		throw new Error("<Keyboard>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
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

    const file$9 = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\Cell.svelte";

    // (108:2) {#if showCheck && !correct}
    function create_if_block_1$2(ctx) {
    	let line;

    	const block = {
    		c: function create() {
    			line = svg_element("line");
    			this.h();
    		},
    		l: function claim(nodes) {
    			line = claim_svg_element(nodes, "line", {
    				x1: true,
    				y1: true,
    				x2: true,
    				y2: true,
    				class: true
    			});

    			children(line).forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(line, "x1", "0");
    			attr_dev(line, "y1", "1");
    			attr_dev(line, "x2", "1");
    			attr_dev(line, "y2", "0");
    			attr_dev(line, "class", "svelte-1ysj7tq");
    			add_location(line, file$9, 108, 4, 2468);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, line, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(line);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(108:2) {#if showCheck && !correct}",
    		ctx
    	});

    	return block;
    }

    // (112:2) {#if value}
    function create_if_block$3(ctx) {
    	let text_1;
    	let t;
    	let text_1_transition;
    	let current;

    	const block = {
    		c: function create() {
    			text_1 = svg_element("text");
    			t = text(/*value*/ ctx[2]);
    			this.h();
    		},
    		l: function claim(nodes) {
    			text_1 = claim_svg_element(nodes, "text", {
    				class: true,
    				x: true,
    				y: true,
    				"text-anchor": true
    			});

    			var text_1_nodes = children(text_1);
    			t = claim_text(text_1_nodes, /*value*/ ctx[2]);
    			text_1_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(text_1, "class", "value svelte-1ysj7tq");
    			attr_dev(text_1, "x", "0.5");
    			attr_dev(text_1, "y", "0.75");
    			attr_dev(text_1, "text-anchor", "middle");
    			add_location(text_1, file$9, 112, 4, 2537);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, text_1, anchor);
    			append_hydration_dev(text_1, t);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (!current || dirty & /*value*/ 4) set_data_dev(t, /*value*/ ctx[2]);
    		},
    		i: function intro(local) {
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
    		o: function outro(local) {
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
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(text_1);
    			if (detaching && text_1_transition) text_1_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(112:2) {#if value}",
    		ctx
    	});

    	return block;
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
    	let if_block0 = /*showCheck*/ ctx[10] && !/*correct*/ ctx[11] && create_if_block_1$2(ctx);
    	let if_block1 = /*value*/ ctx[2] && create_if_block$3(ctx);

    	const block = {
    		c: function create() {
    			g = svg_element("g");
    			rect = svg_element("rect");
    			if (if_block0) if_block0.c();
    			if_block0_anchor = empty();
    			if (if_block1) if_block1.c();
    			text_1 = svg_element("text");
    			t = text(/*number*/ ctx[3]);
    			this.h();
    		},
    		l: function claim(nodes) {
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

    			children(rect).forEach(detach_dev);
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
    			text_1_nodes.forEach(detach_dev);
    			g_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(rect, "width", "1");
    			attr_dev(rect, "height", "1");
    			attr_dev(rect, "rx", "0.2");
    			attr_dev(rect, "class", "svelte-1ysj7tq");
    			add_location(rect, file$9, 105, 2, 2389);
    			attr_dev(text_1, "class", "number svelte-1ysj7tq");
    			attr_dev(text_1, "x", "0.08");
    			attr_dev(text_1, "y", "0.3");
    			attr_dev(text_1, "text-anchor", "start");
    			add_location(text_1, file$9, 121, 2, 2743);
    			attr_dev(g, "class", g_class_value = "cell " + /*custom*/ ctx[4] + " cell-" + /*x*/ ctx[0] + "-" + /*y*/ ctx[1] + " svelte-1ysj7tq");
    			attr_dev(g, "transform", g_transform_value = `translate(${/*x*/ ctx[0]}, ${/*y*/ ctx[1]})`);
    			attr_dev(g, "tabindex", "0");
    			toggle_class(g, "is-focused", /*isFocused*/ ctx[7]);
    			toggle_class(g, "is-secondarily-focused", /*isSecondarilyFocused*/ ctx[8]);
    			toggle_class(g, "is-correct", /*showCheck*/ ctx[10] && /*correct*/ ctx[11]);
    			toggle_class(g, "is-incorrect", /*showCheck*/ ctx[10] && !/*correct*/ ctx[11]);
    			add_location(g, file$9, 94, 0, 2037);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, g, anchor);
    			append_hydration_dev(g, rect);
    			if (if_block0) if_block0.m(g, null);
    			append_hydration_dev(g, if_block0_anchor);
    			if (if_block1) if_block1.m(g, null);
    			append_hydration_dev(g, text_1);
    			append_hydration_dev(text_1, t);
    			/*g_binding*/ ctx[23](g);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(g, "click", /*onClick*/ ctx[13], false, false, false, false),
    					listen_dev(g, "keydown", /*onKeydown*/ ctx[12], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*showCheck*/ ctx[10] && !/*correct*/ ctx[11]) {
    				if (if_block0) ; else {
    					if_block0 = create_if_block_1$2(ctx);
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

    			if (!current || dirty & /*number*/ 8) set_data_dev(t, /*number*/ ctx[3]);

    			if (!current || dirty & /*custom, x, y*/ 19 && g_class_value !== (g_class_value = "cell " + /*custom*/ ctx[4] + " cell-" + /*x*/ ctx[0] + "-" + /*y*/ ctx[1] + " svelte-1ysj7tq")) {
    				attr_dev(g, "class", g_class_value);
    			}

    			if (!current || dirty & /*x, y*/ 3 && g_transform_value !== (g_transform_value = `translate(${/*x*/ ctx[0]}, ${/*y*/ ctx[1]})`)) {
    				attr_dev(g, "transform", g_transform_value);
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
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			/*g_binding*/ ctx[23](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$9.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
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
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Cell', slots, []);
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

    	$$self.$$.on_mount.push(function () {
    		if (x === undefined && !('x' in $$props || $$self.$$.bound[$$self.$$.props['x']])) {
    			console.warn("<Cell> was created without expected prop 'x'");
    		}

    		if (y === undefined && !('y' in $$props || $$self.$$.bound[$$self.$$.props['y']])) {
    			console.warn("<Cell> was created without expected prop 'y'");
    		}

    		if (value === undefined && !('value' in $$props || $$self.$$.bound[$$self.$$.props['value']])) {
    			console.warn("<Cell> was created without expected prop 'value'");
    		}

    		if (answer === undefined && !('answer' in $$props || $$self.$$.bound[$$self.$$.props['answer']])) {
    			console.warn("<Cell> was created without expected prop 'answer'");
    		}

    		if (number === undefined && !('number' in $$props || $$self.$$.bound[$$self.$$.props['number']])) {
    			console.warn("<Cell> was created without expected prop 'number'");
    		}

    		if (index === undefined && !('index' in $$props || $$self.$$.bound[$$self.$$.props['index']])) {
    			console.warn("<Cell> was created without expected prop 'index'");
    		}

    		if (custom === undefined && !('custom' in $$props || $$self.$$.bound[$$self.$$.props['custom']])) {
    			console.warn("<Cell> was created without expected prop 'custom'");
    		}
    	});

    	const writable_props = [
    		'x',
    		'y',
    		'value',
    		'answer',
    		'number',
    		'index',
    		'custom',
    		'changeDelay',
    		'isRevealing',
    		'isChecking',
    		'isFocused',
    		'isSecondarilyFocused',
    		'onFocusCell',
    		'onCellUpdate',
    		'onFocusClueDiff',
    		'onMoveFocus',
    		'onFlipDirection',
    		'onHistoricalChange'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Cell> was created with unknown prop '${key}'`);
    	});

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

    	$$self.$capture_state = () => ({
    		x,
    		y,
    		value,
    		answer,
    		number,
    		index,
    		custom,
    		changeDelay,
    		isRevealing,
    		isChecking,
    		isFocused,
    		isSecondarilyFocused,
    		onFocusCell,
    		onCellUpdate,
    		onFocusClueDiff,
    		onMoveFocus,
    		onFlipDirection,
    		onHistoricalChange,
    		element,
    		onFocusSelf,
    		onKeydown,
    		onClick,
    		pop,
    		showCheck,
    		correct
    	});

    	$$self.$inject_state = $$props => {
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
    		if ('element' in $$props) $$invalidate(9, element = $$props.element);
    		if ('showCheck' in $$props) $$invalidate(10, showCheck = $$props.showCheck);
    		if ('correct' in $$props) $$invalidate(11, correct = $$props.correct);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

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

    class Cell extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

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

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Cell",
    			options,
    			id: create_fragment$9.name
    		});
    	}

    	get x() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set x(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get y() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set y(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get answer() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set answer(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get number() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set number(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get index() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set index(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get custom() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set custom(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get changeDelay() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set changeDelay(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isRevealing() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isRevealing(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isChecking() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isChecking(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFocused() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFocused(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isSecondarilyFocused() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isSecondarilyFocused(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onFocusCell() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onFocusCell(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onCellUpdate() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onCellUpdate(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onFocusClueDiff() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onFocusClueDiff(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onMoveFocus() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onMoveFocus(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onFlipDirection() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onFlipDirection(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onHistoricalChange() {
    		throw new Error("<Cell>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onHistoricalChange(value) {
    		throw new Error("<Cell>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Puzzle.svelte generated by Svelte v3.59.2 */

    const { console: console_1$3 } = globals;
    const file$8 = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\Puzzle.svelte";

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

    // (212:4) {#each cells as { x, y, value, answer, index, number, custom }}
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
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(cell.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(cell.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(cell, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
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
    		i: function intro(local) {
    			if (current) return;
    			transition_in(cell.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(cell.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(cell, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(212:4) {#each cells as { x, y, value, answer, index, number, custom }}",
    		ctx
    	});

    	return block;
    }

    // (236:0) {#if keyboardVisible}
    function create_if_block$2(ctx) {
    	let div;
    	let keyboard;
    	let current;

    	keyboard = new Keyboard({
    			props: {
    				layout: "crossword",
    				style: /*keyboardStyle*/ ctx[8]
    			},
    			$$inline: true
    		});

    	keyboard.$on("keydown", /*onKeydown*/ ctx[20]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(keyboard.$$.fragment);
    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			claim_component(keyboard.$$.fragment, div_nodes);
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div, "class", "keyboard keyboard-container svelte-1mjakjx");
    			add_location(div, file$8, 236, 2, 7155);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);
    			mount_component(keyboard, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const keyboard_changes = {};
    			if (dirty[0] & /*keyboardStyle*/ 256) keyboard_changes.style = /*keyboardStyle*/ ctx[8];
    			keyboard.$set(keyboard_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(keyboard.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(keyboard.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(keyboard);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(236:0) {#if keyboardVisible}",
    		ctx
    	});

    	return block;
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
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	let if_block = /*keyboardVisible*/ ctx[11] && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
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
    		l: function claim(nodes) {
    			section = claim_element(nodes, "SECTION", { class: true });
    			var section_nodes = children(section);
    			svg = claim_svg_element(section_nodes, "svg", { viewBox: true, class: true });
    			var svg_nodes = children(svg);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(svg_nodes);
    			}

    			svg_nodes.forEach(detach_dev);
    			section_nodes.forEach(detach_dev);
    			t = claim_space(nodes);
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(svg, "viewBox", svg_viewBox_value = "0 0 " + /*w*/ ctx[13] + " " + /*h*/ ctx[12]);
    			attr_dev(svg, "class", "svelte-1mjakjx");
    			add_location(svg, file$8, 210, 2, 6262);
    			attr_dev(section, "class", "puzzle svelte-1mjakjx");
    			toggle_class(section, "stacked", /*stacked*/ ctx[5]);
    			toggle_class(section, "is-loaded", /*isLoaded*/ ctx[7]);
    			add_location(section, file$8, 205, 0, 6162);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, section, anchor);
    			append_hydration_dev(section, svg);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(svg, null);
    				}
    			}

    			/*section_binding*/ ctx[27](section);
    			insert_hydration_dev(target, t, anchor);
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(window, "click", /*onClick*/ ctx[21], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*cells, isRevealing, revealDuration, isChecking, focusedCellIndex, isDisableHighlight, secondarilyFocusedCells, onFocusCell, onCellUpdate, onFocusClueDiff, onMoveFocus, onFlipDirection, onHistoricalChange*/ 1033311) {
    				each_value = /*cells*/ ctx[0];
    				validate_each_argument(each_value);
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
    				attr_dev(svg, "viewBox", svg_viewBox_value);
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
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			destroy_each(each_blocks, detaching);
    			/*section_binding*/ ctx[27](null);
    			if (detaching) detach_dev(t);
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$8.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const numberOfStatesInHistory = 10;

    function instance$8($$self, $$props, $$invalidate) {
    	let w;
    	let h;
    	let keyboardVisible;
    	let sortedCellsInDirection;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Puzzle', slots, []);
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
    	let focusedCellIndexHistoryIndex = 0;
    	let focusedCellIndexHistory = [];
    	let secondarilyFocusedCells = [];
    	let isMobile = false;
    	let isPuzzleFocused = false;

    	onMount(() => {
    		$$invalidate(26, isMobile = checkMobile());
    		onFocusCell(0);
    	});

    	function updateSecondarilyFocusedCells() {
    		$$invalidate(10, secondarilyFocusedCells = getSecondarilyFocusedCells({ cells, focusedDirection, focusedCell }));
    		console.log(secondarilyFocusedCells);
    	}

    	function onCellUpdate(index, newValue, diff = 1, doReplaceFilledCells) {
    		console.log("***onCellUpdate***");
    		console.log(index);
    		console.log(newValue);
    		console.log(diff);
    		console.log(doReplaceFilledCells);
    		console.log("***onCellUpdate***");
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

    		if (isAtEndOfClue && diff > 0) {
    			onFocusClueDiff(diff);
    		} else {
    			onFocusCellDiff(diff, doReplaceFilledCells);
    		}
    	}

    	function onHistoricalChange(diff) {
    		cellsHistoryIndex += -diff;
    		$$invalidate(0, cells = cellsHistory[cellsHistoryIndex] || cells);
    		focusedCellIndexHistoryIndex += -diff;
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
    			focusedCellIndexHistoryIndex = 0;
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

    		let nextCluesInDirection = clues.filter(clue => !clue.isFilled && (diff > 0
    		? clue.number > currentNumber
    		: clue.number < currentNumber) && clue.direction == focusedDirection);

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
    		const newDirection = focusedDirection === "across" ? "down" : "across";
    		const hasClueInNewDirection = !!focusedCell["clueNumbers"][newDirection];
    		if (hasClueInNewDirection) $$invalidate(22, focusedDirection = newDirection);
    	}

    	function onKeydown({ detail }) {
    		const diff = detail === "Backspace" ? -1 : 1;
    		const value = detail === "Backspace" ? "" : detail;
    		onCellUpdate(focusedCellIndex, value, diff);
    	}

    	function onClick() {
    		isPuzzleFocused = element.contains(document.activeElement);
    	}

    	$$self.$$.on_mount.push(function () {
    		if (clues === undefined && !('clues' in $$props || $$self.$$.bound[$$self.$$.props['clues']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'clues'");
    		}

    		if (cells === undefined && !('cells' in $$props || $$self.$$.bound[$$self.$$.props['cells']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'cells'");
    		}

    		if (focusedDirection === undefined && !('focusedDirection' in $$props || $$self.$$.bound[$$self.$$.props['focusedDirection']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'focusedDirection'");
    		}

    		if (focusedCellIndex === undefined && !('focusedCellIndex' in $$props || $$self.$$.bound[$$self.$$.props['focusedCellIndex']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'focusedCellIndex'");
    		}

    		if (focusedCell === undefined && !('focusedCell' in $$props || $$self.$$.bound[$$self.$$.props['focusedCell']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'focusedCell'");
    		}

    		if (isRevealing === undefined && !('isRevealing' in $$props || $$self.$$.bound[$$self.$$.props['isRevealing']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'isRevealing'");
    		}

    		if (isChecking === undefined && !('isChecking' in $$props || $$self.$$.bound[$$self.$$.props['isChecking']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'isChecking'");
    		}

    		if (isDisableHighlight === undefined && !('isDisableHighlight' in $$props || $$self.$$.bound[$$self.$$.props['isDisableHighlight']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'isDisableHighlight'");
    		}

    		if (stacked === undefined && !('stacked' in $$props || $$self.$$.bound[$$self.$$.props['stacked']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'stacked'");
    		}

    		if (showKeyboard === undefined && !('showKeyboard' in $$props || $$self.$$.bound[$$self.$$.props['showKeyboard']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'showKeyboard'");
    		}

    		if (isLoaded === undefined && !('isLoaded' in $$props || $$self.$$.bound[$$self.$$.props['isLoaded']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'isLoaded'");
    		}

    		if (keyboardStyle === undefined && !('keyboardStyle' in $$props || $$self.$$.bound[$$self.$$.props['keyboardStyle']])) {
    			console_1$3.warn("<Puzzle> was created without expected prop 'keyboardStyle'");
    		}
    	});

    	const writable_props = [
    		'clues',
    		'cells',
    		'focusedDirection',
    		'focusedCellIndex',
    		'focusedCell',
    		'isRevealing',
    		'isChecking',
    		'isDisableHighlight',
    		'stacked',
    		'revealDuration',
    		'showKeyboard',
    		'isLoaded',
    		'keyboardStyle'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$3.warn(`<Puzzle> was created with unknown prop '${key}'`);
    	});

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

    	$$self.$capture_state = () => ({
    		onMount,
    		Keyboard,
    		getSecondarilyFocusedCells,
    		getCellAfterDiff,
    		checkMobile,
    		Cell,
    		clues,
    		cells,
    		focusedDirection,
    		focusedCellIndex,
    		focusedCell,
    		isRevealing,
    		isChecking,
    		isDisableHighlight,
    		stacked,
    		revealDuration,
    		showKeyboard,
    		isLoaded,
    		keyboardStyle,
    		element,
    		cellsHistoryIndex,
    		cellsHistory,
    		focusedCellIndexHistoryIndex,
    		focusedCellIndexHistory,
    		secondarilyFocusedCells,
    		isMobile,
    		isPuzzleFocused,
    		numberOfStatesInHistory,
    		updateSecondarilyFocusedCells,
    		onCellUpdate,
    		onHistoricalChange,
    		onFocusCell,
    		onFocusCellDiff,
    		onFocusClueDiff,
    		onMoveFocus,
    		onFlipDirection,
    		onKeydown,
    		onClick,
    		sortedCellsInDirection,
    		keyboardVisible,
    		h,
    		w
    	});

    	$$self.$inject_state = $$props => {
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
    		if ('element' in $$props) $$invalidate(9, element = $$props.element);
    		if ('cellsHistoryIndex' in $$props) cellsHistoryIndex = $$props.cellsHistoryIndex;
    		if ('cellsHistory' in $$props) cellsHistory = $$props.cellsHistory;
    		if ('focusedCellIndexHistoryIndex' in $$props) focusedCellIndexHistoryIndex = $$props.focusedCellIndexHistoryIndex;
    		if ('focusedCellIndexHistory' in $$props) focusedCellIndexHistory = $$props.focusedCellIndexHistory;
    		if ('secondarilyFocusedCells' in $$props) $$invalidate(10, secondarilyFocusedCells = $$props.secondarilyFocusedCells);
    		if ('isMobile' in $$props) $$invalidate(26, isMobile = $$props.isMobile);
    		if ('isPuzzleFocused' in $$props) isPuzzleFocused = $$props.isPuzzleFocused;
    		if ('sortedCellsInDirection' in $$props) sortedCellsInDirection = $$props.sortedCellsInDirection;
    		if ('keyboardVisible' in $$props) $$invalidate(11, keyboardVisible = $$props.keyboardVisible);
    		if ('h' in $$props) $$invalidate(12, h = $$props.h);
    		if ('w' in $$props) $$invalidate(13, w = $$props.w);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

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

    class Puzzle extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

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

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Puzzle",
    			options,
    			id: create_fragment$8.name
    		});
    	}

    	get clues() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clues(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get cells() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set cells(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedDirection() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedDirection(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedCellIndex() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedCellIndex(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedCell() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedCell(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isRevealing() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isRevealing(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isChecking() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isChecking(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDisableHighlight() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDisableHighlight(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stacked() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stacked(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get revealDuration() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set revealDuration(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showKeyboard() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showKeyboard(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isLoaded() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isLoaded(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get keyboardStyle() {
    		throw new Error("<Puzzle>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set keyboardStyle(value) {
    		throw new Error("<Puzzle>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
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

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Clue.svelte generated by Svelte v3.59.2 */

    const { console: console_1$2 } = globals;
    const file$7 = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\Clue.svelte";

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

    	const block = {
    		c: function create() {
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
    		l: function claim(nodes) {
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
    			children(path0).forEach(detach_dev);
    			path1 = claim_svg_element(g_nodes, "path", { d: true, fill: true, class: true });
    			children(path1).forEach(detach_dev);
    			g_nodes.forEach(detach_dev);
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

    			children(rect).forEach(detach_dev);
    			clipPath_nodes.forEach(detach_dev);
    			defs_nodes.forEach(detach_dev);
    			svg_nodes.forEach(detach_dev);
    			button_nodes.forEach(detach_dev);
    			li_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(path0, "d", "M13.7995 25.7885C20.0747 25.7885 25.1615 20.7017 25.1615 14.4264C25.1615 8.15119 20.0747 3.0644 13.7995 3.0644C7.52423 3.0644 2.43745 8.15119 2.43745 14.4264C2.43745 20.7017 7.52423 25.7885 13.7995 25.7885ZM13.7995 28.0609C6.26986 28.0609 0.165039 21.9561 0.165039 14.4264C0.165039 6.89682 6.26986 0.791992 13.7995 0.791992C21.3291 0.791992 27.4339 6.89682 27.4339 14.4264C27.4339 21.9561 21.3291 28.0609 13.7995 28.0609Z");
    			attr_dev(path0, "fill", "#A48F86");
    			attr_dev(path0, "class", "svelte-1navz17");
    			add_location(path0, file$7, 140, 8, 5668);
    			attr_dev(path1, "d", "M14.0384 6.97314C12.3796 6.97314 11.0616 7.45035 10.1072 8.42749C9.13004 9.3819 8.65283 10.6772 8.65283 12.336H11.0616C11.0616 11.3362 11.2661 10.5408 11.6751 9.99545C12.1296 9.35917 12.8795 9.04104 13.9021 9.04104C14.7202 9.04104 15.3564 9.26828 15.8109 9.72276C16.2427 10.1772 16.4699 10.7908 16.4699 11.5861C16.4699 12.177 16.2654 12.7223 15.8564 13.245L15.4701 13.6768C14.0612 14.9266 13.1976 15.8583 12.8795 16.4945C12.5841 17.0854 12.4478 17.8125 12.4478 18.6533V19.0396H14.8792V18.6533C14.8792 18.0852 14.9929 17.5853 15.2428 17.1308C15.4473 16.7218 15.7655 16.3355 16.1745 15.9719C17.2653 15.0402 17.9015 14.4494 18.1061 14.1994C18.6514 13.4722 18.9468 12.5405 18.9468 11.4271C18.9468 10.0636 18.4924 8.97286 17.6061 8.17752C16.6972 7.35945 15.5155 6.97314 14.0384 6.97314ZM13.6521 20.2667C13.1749 20.2667 12.7886 20.4031 12.4932 20.7212C12.1523 21.0166 11.9933 21.4029 11.9933 21.8801C11.9933 22.3346 12.1523 22.7209 12.4932 23.0391C12.7886 23.3572 13.1749 23.5163 13.6521 23.5163C14.1066 23.5163 14.5156 23.3572 14.8565 23.0618C15.1746 22.7437 15.3337 22.3574 15.3337 21.8801C15.3337 21.4029 15.1746 21.0166 14.8565 20.7212C14.5384 20.4031 14.1293 20.2667 13.6521 20.2667Z");
    			attr_dev(path1, "fill", "#A48F86");
    			attr_dev(path1, "class", "svelte-1navz17");
    			add_location(path1, file$7, 141, 8, 6125);
    			attr_dev(g, "clip-path", "url(#clip0_1554_302)");
    			add_location(g, file$7, 139, 6, 5623);
    			attr_dev(rect, "width", "27.2689");
    			attr_dev(rect, "height", "27.2689");
    			attr_dev(rect, "fill", "white");
    			attr_dev(rect, "transform", "translate(0.165039 0.791992)");
    			add_location(rect, file$7, 145, 10, 7408);
    			attr_dev(clipPath, "id", "clip0_1554_302");
    			add_location(clipPath, file$7, 144, 8, 7367);
    			add_location(defs, file$7, 143, 6, 7352);
    			attr_dev(svg, "class", "modal_icon svelte-1navz17");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "viewBox", "0 0 28 29");
    			attr_dev(svg, "fill", "none");
    			add_location(svg, file$7, 138, 4, 5525);
    			attr_dev(button, "class", button_class_value = "clue " + /*custom*/ ctx[2] + " svelte-1navz17");
    			toggle_class(button, "is-disable-highlight", /*isDisableHighlight*/ ctx[6]);
    			toggle_class(button, "is-number-focused", /*isNumberFocused*/ ctx[4]);
    			toggle_class(button, "is-direction-focused", /*isDirectionFocused*/ ctx[5]);
    			toggle_class(button, "is-filled", /*isFilled*/ ctx[3]);
    			add_location(button, file$7, 127, 2, 5178);
    			attr_dev(li, "class", li_class_value = "" + (null_to_empty(/*clueClass*/ ctx[9]) + " svelte-1navz17"));
    			add_location(li, file$7, 126, 0, 5081);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, li, anchor);
    			append_hydration_dev(li, button);
    			append_hydration_dev(button, svg);
    			append_hydration_dev(svg, g);
    			append_hydration_dev(g, path0);
    			append_hydration_dev(g, path1);
    			append_hydration_dev(svg, defs);
    			append_hydration_dev(defs, clipPath);
    			append_hydration_dev(clipPath, rect);
    			/*li_binding*/ ctx[14](li);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button, "click", /*click_handler*/ ctx[13], false, false, false, false),
    					action_destroyer(scrollTo_action = scrollTO.call(null, li, /*isFocused*/ ctx[10])),
    					listen_dev(
    						li,
    						"click",
    						function () {
    							if (is_function(/*onFocus*/ ctx[7])) /*onFocus*/ ctx[7].apply(this, arguments);
    						},
    						false,
    						false,
    						false,
    						false
    					)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, [dirty]) {
    			ctx = new_ctx;

    			if (dirty & /*custom*/ 4 && button_class_value !== (button_class_value = "clue " + /*custom*/ ctx[2] + " svelte-1navz17")) {
    				attr_dev(button, "class", button_class_value);
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

    			if (dirty & /*clueClass*/ 512 && li_class_value !== (li_class_value = "" + (null_to_empty(/*clueClass*/ ctx[9]) + " svelte-1navz17"))) {
    				attr_dev(li, "class", li_class_value);
    			}

    			if (scrollTo_action && is_function(scrollTo_action.update) && dirty & /*isFocused*/ 1024) scrollTo_action.update.call(null, /*isFocused*/ ctx[10]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(li);
    			/*li_binding*/ ctx[14](null);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let isFocused;
    	let clueClass;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Clue', slots, []);
    	let { number } = $$props;
    	let { direction } = $$props;
    	let { clue } = $$props;
    	let { custom } = $$props;
    	let { isFilled } = $$props;
    	let { isNumberFocused = false } = $$props;
    	let { isDirectionFocused = false } = $$props;
    	let { isDisableHighlight = false } = $$props;

    	let { onFocus = () => {
    		
    	} } = $$props;

    	let element;

    	function handleShare(params) {
    		console.log("分享了。。。");
    		console.log("eeee");
    		console.log(tips[params.number - 1]);
    		console.log(params);
    		console.log(params.item.getAttribute("data-url"));

    		// const share__url = params.item.getAttribute("data-url")
    		const share__type = params.item.getAttribute("data-type");

    		let _url = '';

    		switch (share__type) {
    			case 'facebook':
    				_url = `https://www.facebook.com/sharer/sharer.php?u=https://jackery-crossword.vercel.app/`;
    				break;
    			case 'twitter':
    				_url = `https://twitter.com/intent/tweet?url=https://jackery-crossword.vercel.app&text=${encodeURIComponent("jackery cccrossword game!")}`;
    				break;
    			case 'whatsapp':
    				_url = `https://api.whatsapp.com/send?text=${encodeURIComponent("jackery cccrossword game!")}&url=https://jackery-crossword.vercel.app`;
    				break;
    			default:
    				_url = 'https://jackery-crossword.vercel.app/';
    				break;
    		}

    		setTimeout(
    			() => {
    				window.localStorage.setItem(`__jky_shared__${params.number}`, "true");
    				params.el.querySelector(".modal-content-body").innerHTML = createSocialDom(true, params.number);
    			},
    			2000
    		);

    		window.open(_url, '单独窗口', 'height=500,width=600,top=30,left=20,toolbar=no,menubar=no,scrollbars=no,resizable=no,location=no,status=no');
    	}

    	function createSocialDom(flag, num) {
    		const shareDom = `<h3 id="xxl" class="tips_modal__title">Need more hints?</h3>
    <div class="tips_modal__subtitle">Click the button below to share this game on social media and get the answers.</div>
    <ul class="tips_modal__socials">
      <li>
        <div data-url="/" data-type="facebook">
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
          <img src="https://cdn.shopify.com/s/files/1/0970/9262/files/f01bcca8403a21bffff4e86dc1f517c0.png?v=1698731889" alt="whatsapp" />
        </div>
      </li>  

      <li>
        <div data-url="/" data-type="unknow">
          <img src="https://cdn.shopify.com/s/files/1/0970/9262/files/597349547b5720f8827002705db04931.jpg?v=1698731889" alt="message" />
        </div>
      </li>  
    </ul>`;

    		const answerDom = `<h3 class="tips_modal__title">${tips[num - 1].title}</h3>
    <div class="tips_modal__des">${tips[num - 1].des}</div>
    `;

    		return flag ? answerDom : shareDom;
    	}

    	function handleOpenHelp(clue_name, number) {
    		console.log(tips);
    		const hasShared = window.localStorage.getItem(`__jky_shared__${number}`) || false;
    		console.log(clue_name);
    		console.log(number);
    		const params = { number, clue_name };

    		Modal.getInstance(createSocialDom(hasShared, number), {
    			header: "",
    			id: `cell_modal_${clueClass}`,
    			class: "",
    			cb: el => {
    				if (hasShared) {
    					el.querySelector(".modal-content-body").innerHTML = createSocialDom(hasShared, number);
    				}

    				el.querySelectorAll(".tips_modal__socials li>div").forEach(item => {
    					item.removeEventListener("click", () => {
    						handleShare({ ...params, item, el });
    					});
    				});

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
    	}

    	$$self.$$.on_mount.push(function () {
    		if (number === undefined && !('number' in $$props || $$self.$$.bound[$$self.$$.props['number']])) {
    			console_1$2.warn("<Clue> was created without expected prop 'number'");
    		}

    		if (direction === undefined && !('direction' in $$props || $$self.$$.bound[$$self.$$.props['direction']])) {
    			console_1$2.warn("<Clue> was created without expected prop 'direction'");
    		}

    		if (clue === undefined && !('clue' in $$props || $$self.$$.bound[$$self.$$.props['clue']])) {
    			console_1$2.warn("<Clue> was created without expected prop 'clue'");
    		}

    		if (custom === undefined && !('custom' in $$props || $$self.$$.bound[$$self.$$.props['custom']])) {
    			console_1$2.warn("<Clue> was created without expected prop 'custom'");
    		}

    		if (isFilled === undefined && !('isFilled' in $$props || $$self.$$.bound[$$self.$$.props['isFilled']])) {
    			console_1$2.warn("<Clue> was created without expected prop 'isFilled'");
    		}
    	});

    	const writable_props = [
    		'number',
    		'direction',
    		'clue',
    		'custom',
    		'isFilled',
    		'isNumberFocused',
    		'isDirectionFocused',
    		'isDisableHighlight',
    		'onFocus'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$2.warn(`<Clue> was created with unknown prop '${key}'`);
    	});

    	const click_handler = () => {
    		handleOpenHelp(clue, number);
    	};

    	function li_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			element = $$value;
    			$$invalidate(8, element);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ('number' in $$props) $$invalidate(0, number = $$props.number);
    		if ('direction' in $$props) $$invalidate(12, direction = $$props.direction);
    		if ('clue' in $$props) $$invalidate(1, clue = $$props.clue);
    		if ('custom' in $$props) $$invalidate(2, custom = $$props.custom);
    		if ('isFilled' in $$props) $$invalidate(3, isFilled = $$props.isFilled);
    		if ('isNumberFocused' in $$props) $$invalidate(4, isNumberFocused = $$props.isNumberFocused);
    		if ('isDirectionFocused' in $$props) $$invalidate(5, isDirectionFocused = $$props.isDirectionFocused);
    		if ('isDisableHighlight' in $$props) $$invalidate(6, isDisableHighlight = $$props.isDisableHighlight);
    		if ('onFocus' in $$props) $$invalidate(7, onFocus = $$props.onFocus);
    	};

    	$$self.$capture_state = () => ({
    		scrollTo: scrollTO,
    		ZModle: Modal,
    		tips,
    		number,
    		direction,
    		clue,
    		custom,
    		isFilled,
    		isNumberFocused,
    		isDirectionFocused,
    		isDisableHighlight,
    		onFocus,
    		element,
    		handleShare,
    		createSocialDom,
    		handleOpenHelp,
    		clueClass,
    		isFocused
    	});

    	$$self.$inject_state = $$props => {
    		if ('number' in $$props) $$invalidate(0, number = $$props.number);
    		if ('direction' in $$props) $$invalidate(12, direction = $$props.direction);
    		if ('clue' in $$props) $$invalidate(1, clue = $$props.clue);
    		if ('custom' in $$props) $$invalidate(2, custom = $$props.custom);
    		if ('isFilled' in $$props) $$invalidate(3, isFilled = $$props.isFilled);
    		if ('isNumberFocused' in $$props) $$invalidate(4, isNumberFocused = $$props.isNumberFocused);
    		if ('isDirectionFocused' in $$props) $$invalidate(5, isDirectionFocused = $$props.isDirectionFocused);
    		if ('isDisableHighlight' in $$props) $$invalidate(6, isDisableHighlight = $$props.isDisableHighlight);
    		if ('onFocus' in $$props) $$invalidate(7, onFocus = $$props.onFocus);
    		if ('element' in $$props) $$invalidate(8, element = $$props.element);
    		if ('clueClass' in $$props) $$invalidate(9, clueClass = $$props.clueClass);
    		if ('isFocused' in $$props) $$invalidate(10, isFocused = $$props.isFocused);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

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
    		click_handler,
    		li_binding
    	];
    }

    class Clue extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {
    			number: 0,
    			direction: 12,
    			clue: 1,
    			custom: 2,
    			isFilled: 3,
    			isNumberFocused: 4,
    			isDirectionFocused: 5,
    			isDisableHighlight: 6,
    			onFocus: 7
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Clue",
    			options,
    			id: create_fragment$7.name
    		});
    	}

    	get number() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set number(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get direction() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set direction(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get clue() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clue(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get custom() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set custom(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFilled() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFilled(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isNumberFocused() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isNumberFocused(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDirectionFocused() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDirectionFocused(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDisableHighlight() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDisableHighlight(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onFocus() {
    		throw new Error("<Clue>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onFocus(value) {
    		throw new Error("<Clue>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\ClueList.svelte generated by Svelte v3.59.2 */
    const file$6 = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\ClueList.svelte";

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
    				number: /*clue*/ ctx[7].number,
    				direction: /*direction*/ ctx[0],
    				custom: /*clue*/ ctx[7].custom,
    				isFilled: /*clue*/ ctx[7].isFilled,
    				isNumberFocused: /*focusedClueNumbers*/ ctx[2][/*direction*/ ctx[0]] === /*clue*/ ctx[7].number,
    				isDirectionFocused: /*isDirectionFocused*/ ctx[3],
    				isDisableHighlight: /*isDisableHighlight*/ ctx[5],
    				onFocus: func
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(clue.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(clue.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(clue, target, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const clue_changes = {};
    			if (dirty & /*clues*/ 2) clue_changes.clue = /*clue*/ ctx[7].clue;
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
    		i: function intro(local) {
    			if (current) return;
    			transition_in(clue.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(clue.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(clue, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(15:4) {#each clues as clue}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let p;
    	let t0;
    	let t1;
    	let div;
    	let ul;
    	let current;
    	let each_value = /*clues*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
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
    		l: function claim(nodes) {
    			p = claim_element(nodes, "P", { class: true });
    			var p_nodes = children(p);
    			t0 = claim_text(p_nodes, /*direction*/ ctx[0]);
    			p_nodes.forEach(detach_dev);
    			t1 = claim_space(nodes);
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			ul = claim_element(div_nodes, "UL", { class: true });
    			var ul_nodes = children(ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(ul_nodes);
    			}

    			ul_nodes.forEach(detach_dev);
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(p, "class", "svelte-1l0ulcd");
    			add_location(p, file$6, 11, 0, 226);
    			attr_dev(ul, "class", "svelte-1l0ulcd");
    			add_location(ul, file$6, 13, 2, 266);
    			attr_dev(div, "class", "list svelte-1l0ulcd");
    			add_location(div, file$6, 12, 0, 245);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, p, anchor);
    			append_hydration_dev(p, t0);
    			insert_hydration_dev(target, t1, anchor);
    			insert_hydration_dev(target, div, anchor);
    			append_hydration_dev(div, ul);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(ul, null);
    				}
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (!current || dirty & /*direction*/ 1) set_data_dev(t0, /*direction*/ ctx[0]);

    			if (dirty & /*clues, direction, focusedClueNumbers, isDirectionFocused, isDisableHighlight, onClueFocus*/ 63) {
    				each_value = /*clues*/ ctx[1];
    				validate_each_argument(each_value);
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
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(p);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('ClueList', slots, []);
    	let { direction } = $$props;
    	let { clues } = $$props;
    	let { focusedClueNumbers } = $$props;
    	let { isDirectionFocused } = $$props;
    	let { onClueFocus } = $$props;
    	let { isDisableHighlight } = $$props;

    	$$self.$$.on_mount.push(function () {
    		if (direction === undefined && !('direction' in $$props || $$self.$$.bound[$$self.$$.props['direction']])) {
    			console.warn("<ClueList> was created without expected prop 'direction'");
    		}

    		if (clues === undefined && !('clues' in $$props || $$self.$$.bound[$$self.$$.props['clues']])) {
    			console.warn("<ClueList> was created without expected prop 'clues'");
    		}

    		if (focusedClueNumbers === undefined && !('focusedClueNumbers' in $$props || $$self.$$.bound[$$self.$$.props['focusedClueNumbers']])) {
    			console.warn("<ClueList> was created without expected prop 'focusedClueNumbers'");
    		}

    		if (isDirectionFocused === undefined && !('isDirectionFocused' in $$props || $$self.$$.bound[$$self.$$.props['isDirectionFocused']])) {
    			console.warn("<ClueList> was created without expected prop 'isDirectionFocused'");
    		}

    		if (onClueFocus === undefined && !('onClueFocus' in $$props || $$self.$$.bound[$$self.$$.props['onClueFocus']])) {
    			console.warn("<ClueList> was created without expected prop 'onClueFocus'");
    		}

    		if (isDisableHighlight === undefined && !('isDisableHighlight' in $$props || $$self.$$.bound[$$self.$$.props['isDisableHighlight']])) {
    			console.warn("<ClueList> was created without expected prop 'isDisableHighlight'");
    		}
    	});

    	const writable_props = [
    		'direction',
    		'clues',
    		'focusedClueNumbers',
    		'isDirectionFocused',
    		'onClueFocus',
    		'isDisableHighlight'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<ClueList> was created with unknown prop '${key}'`);
    	});

    	const func = clue => onClueFocus(clue);

    	$$self.$$set = $$props => {
    		if ('direction' in $$props) $$invalidate(0, direction = $$props.direction);
    		if ('clues' in $$props) $$invalidate(1, clues = $$props.clues);
    		if ('focusedClueNumbers' in $$props) $$invalidate(2, focusedClueNumbers = $$props.focusedClueNumbers);
    		if ('isDirectionFocused' in $$props) $$invalidate(3, isDirectionFocused = $$props.isDirectionFocused);
    		if ('onClueFocus' in $$props) $$invalidate(4, onClueFocus = $$props.onClueFocus);
    		if ('isDisableHighlight' in $$props) $$invalidate(5, isDisableHighlight = $$props.isDisableHighlight);
    	};

    	$$self.$capture_state = () => ({
    		Clue,
    		direction,
    		clues,
    		focusedClueNumbers,
    		isDirectionFocused,
    		onClueFocus,
    		isDisableHighlight
    	});

    	$$self.$inject_state = $$props => {
    		if ('direction' in $$props) $$invalidate(0, direction = $$props.direction);
    		if ('clues' in $$props) $$invalidate(1, clues = $$props.clues);
    		if ('focusedClueNumbers' in $$props) $$invalidate(2, focusedClueNumbers = $$props.focusedClueNumbers);
    		if ('isDirectionFocused' in $$props) $$invalidate(3, isDirectionFocused = $$props.isDirectionFocused);
    		if ('onClueFocus' in $$props) $$invalidate(4, onClueFocus = $$props.onClueFocus);
    		if ('isDisableHighlight' in $$props) $$invalidate(5, isDisableHighlight = $$props.isDisableHighlight);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

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

    class ClueList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {
    			direction: 0,
    			clues: 1,
    			focusedClueNumbers: 2,
    			isDirectionFocused: 3,
    			onClueFocus: 4,
    			isDisableHighlight: 5
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "ClueList",
    			options,
    			id: create_fragment$6.name
    		});
    	}

    	get direction() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set direction(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get clues() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clues(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedClueNumbers() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedClueNumbers(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDirectionFocused() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDirectionFocused(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get onClueFocus() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set onClueFocus(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDisableHighlight() {
    		throw new Error("<ClueList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDisableHighlight(value) {
    		throw new Error("<ClueList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\Clues.svelte generated by Svelte v3.59.2 */

    const { console: console_1$1 } = globals;
    const file$5 = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\Clues.svelte";

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[12] = list[i];
    	return child_ctx;
    }

    // (51:4) {#each ['across', 'down'] as direction}
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
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(cluelist.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(cluelist.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(cluelist, target, anchor);
    			current = true;
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			const cluelist_changes = {};
    			if (dirty & /*focusedClueNumbers*/ 16) cluelist_changes.focusedClueNumbers = /*focusedClueNumbers*/ ctx[4];
    			if (dirty & /*clues*/ 2) cluelist_changes.clues = /*clues*/ ctx[1].filter(func);
    			if (dirty & /*focusedDirection*/ 1) cluelist_changes.isDirectionFocused = /*focusedDirection*/ ctx[0] === /*direction*/ ctx[12];
    			if (dirty & /*isDisableHighlight*/ 4) cluelist_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[2];
    			cluelist.$set(cluelist_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(cluelist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(cluelist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(cluelist, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(51:4) {#each ['across', 'down'] as direction}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let section;
    	let div0;
    	let t;
    	let div1;
    	let current;
    	let each_value = ['across', 'down'];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < 2; i += 1) {
    		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			section = element("section");
    			div0 = element("div");
    			t = space();
    			div1 = element("div");

    			for (let i = 0; i < 2; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l: function claim(nodes) {
    			section = claim_element(nodes, "SECTION", { class: true });
    			var section_nodes = children(section);
    			div0 = claim_element(section_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			div0_nodes.forEach(detach_dev);
    			t = claim_space(section_nodes);
    			div1 = claim_element(section_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);

    			for (let i = 0; i < 2; i += 1) {
    				each_blocks[i].l(div1_nodes);
    			}

    			div1_nodes.forEach(detach_dev);
    			section_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div0, "class", "clues--stacked svelte-vzp4hg");
    			add_location(div0, file$5, 45, 2, 1238);
    			attr_dev(div1, "class", "clues--list svelte-vzp4hg");
    			add_location(div1, file$5, 49, 2, 1345);
    			attr_dev(section, "class", "clues svelte-vzp4hg");
    			toggle_class(section, "is-loaded", /*isLoaded*/ ctx[3]);
    			add_location(section, file$5, 44, 0, 1183);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, section, anchor);
    			append_hydration_dev(section, div0);
    			append_hydration_dev(section, t);
    			append_hydration_dev(section, div1);

    			for (let i = 0; i < 2; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(div1, null);
    				}
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*focusedClueNumbers, clues, focusedDirection, isDisableHighlight, onClueFocus*/ 55) {
    				each_value = ['across', 'down'];
    				validate_each_argument(each_value);
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
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < 2; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < 2; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(section);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let focusedClueNumbers;
    	let currentClue;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Clues', slots, []);
    	let { clues } = $$props;
    	let { cellIndexMap } = $$props;
    	let { focusedDirection } = $$props;
    	let { focusedCellIndex } = $$props;
    	let { focusedCell } = $$props;
    	let { stacked } = $$props;
    	let { isDisableHighlight } = $$props;
    	let { isLoaded } = $$props;

    	function onClueFocus({ direction, id, number }) {
    		console.log(focusedCell);
    		console.log(focusedCellIndex);
    		console.log(focusedDirection);

    		// 避免当前cell被重置
    		if (focusedDirection === direction && focusedCell.clueNumbers[direction] === number) {
    			return;
    		}

    		$$invalidate(0, focusedDirection = direction);
    		$$invalidate(6, focusedCellIndex = cellIndexMap[id] || 0);
    	}

    	$$self.$$.on_mount.push(function () {
    		if (clues === undefined && !('clues' in $$props || $$self.$$.bound[$$self.$$.props['clues']])) {
    			console_1$1.warn("<Clues> was created without expected prop 'clues'");
    		}

    		if (cellIndexMap === undefined && !('cellIndexMap' in $$props || $$self.$$.bound[$$self.$$.props['cellIndexMap']])) {
    			console_1$1.warn("<Clues> was created without expected prop 'cellIndexMap'");
    		}

    		if (focusedDirection === undefined && !('focusedDirection' in $$props || $$self.$$.bound[$$self.$$.props['focusedDirection']])) {
    			console_1$1.warn("<Clues> was created without expected prop 'focusedDirection'");
    		}

    		if (focusedCellIndex === undefined && !('focusedCellIndex' in $$props || $$self.$$.bound[$$self.$$.props['focusedCellIndex']])) {
    			console_1$1.warn("<Clues> was created without expected prop 'focusedCellIndex'");
    		}

    		if (focusedCell === undefined && !('focusedCell' in $$props || $$self.$$.bound[$$self.$$.props['focusedCell']])) {
    			console_1$1.warn("<Clues> was created without expected prop 'focusedCell'");
    		}

    		if (stacked === undefined && !('stacked' in $$props || $$self.$$.bound[$$self.$$.props['stacked']])) {
    			console_1$1.warn("<Clues> was created without expected prop 'stacked'");
    		}

    		if (isDisableHighlight === undefined && !('isDisableHighlight' in $$props || $$self.$$.bound[$$self.$$.props['isDisableHighlight']])) {
    			console_1$1.warn("<Clues> was created without expected prop 'isDisableHighlight'");
    		}

    		if (isLoaded === undefined && !('isLoaded' in $$props || $$self.$$.bound[$$self.$$.props['isLoaded']])) {
    			console_1$1.warn("<Clues> was created without expected prop 'isLoaded'");
    		}
    	});

    	const writable_props = [
    		'clues',
    		'cellIndexMap',
    		'focusedDirection',
    		'focusedCellIndex',
    		'focusedCell',
    		'stacked',
    		'isDisableHighlight',
    		'isLoaded'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1$1.warn(`<Clues> was created with unknown prop '${key}'`);
    	});

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

    	$$self.$capture_state = () => ({
    		ClueList,
    		clues,
    		cellIndexMap,
    		focusedDirection,
    		focusedCellIndex,
    		focusedCell,
    		stacked,
    		isDisableHighlight,
    		isLoaded,
    		onClueFocus,
    		focusedClueNumbers,
    		currentClue
    	});

    	$$self.$inject_state = $$props => {
    		if ('clues' in $$props) $$invalidate(1, clues = $$props.clues);
    		if ('cellIndexMap' in $$props) $$invalidate(7, cellIndexMap = $$props.cellIndexMap);
    		if ('focusedDirection' in $$props) $$invalidate(0, focusedDirection = $$props.focusedDirection);
    		if ('focusedCellIndex' in $$props) $$invalidate(6, focusedCellIndex = $$props.focusedCellIndex);
    		if ('focusedCell' in $$props) $$invalidate(8, focusedCell = $$props.focusedCell);
    		if ('stacked' in $$props) $$invalidate(9, stacked = $$props.stacked);
    		if ('isDisableHighlight' in $$props) $$invalidate(2, isDisableHighlight = $$props.isDisableHighlight);
    		if ('isLoaded' in $$props) $$invalidate(3, isLoaded = $$props.isLoaded);
    		if ('focusedClueNumbers' in $$props) $$invalidate(4, focusedClueNumbers = $$props.focusedClueNumbers);
    		if ('currentClue' in $$props) currentClue = $$props.currentClue;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*focusedCell*/ 256) {
    			$$invalidate(4, focusedClueNumbers = focusedCell.clueNumbers || {});
    		}

    		if ($$self.$$.dirty & /*clues, focusedDirection, focusedClueNumbers*/ 19) {
    			currentClue = clues.find(c => c.direction === focusedDirection && c.number === focusedClueNumbers[focusedDirection]) || {};
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

    class Clues extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

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

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Clues",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get clues() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clues(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get cellIndexMap() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set cellIndexMap(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedDirection() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedDirection(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedCellIndex() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedCellIndex(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusedCell() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set focusedCell(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stacked() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stacked(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDisableHighlight() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDisableHighlight(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isLoaded() {
    		throw new Error("<Clues>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isLoaded(value) {
    		throw new Error("<Clues>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
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
    const file$4 = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\Confetti.svelte";

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

    	const block = {
    		c: function create() {
    			g1 = svg_element("g");
    			g0 = svg_element("g");
    			this.h();
    		},
    		l: function claim(nodes) {
    			g1 = claim_svg_element(nodes, "g", { style: true, class: true });
    			var g1_nodes = children(g1);
    			g0 = claim_svg_element(g1_nodes, "g", { fill: true, style: true, class: true });
    			var g0_nodes = children(g0);
    			g0_nodes.forEach(detach_dev);
    			g1_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(g0, "fill", /*color*/ ctx[9]);

    			attr_dev(g0, "style", g0_style_value = [
    				`--rotation: ${Math.random() * 360}deg`,
    				`animation-delay: ${quadIn(/*i*/ ctx[12] / /*numberOfElements*/ ctx[0])}s`,
    				`animation-duration: ${/*durationInSeconds*/ ctx[1] * /*randomNumber*/ ctx[2](0.7, 1)}s`
    			].join(';'));

    			attr_dev(g0, "class", "svelte-15wt7c8");
    			add_location(g0, file$4, 46, 6, 2525);
    			set_style(g1, "transform", "scale(" + /*scale*/ ctx[10] + ")");
    			attr_dev(g1, "class", "svelte-15wt7c8");
    			add_location(g1, file$4, 45, 4, 2481);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, g1, anchor);
    			append_hydration_dev(g1, g0);
    			g0.innerHTML = raw_value;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*numberOfElements, durationInSeconds*/ 3 && g0_style_value !== (g0_style_value = [
    				`--rotation: ${Math.random() * 360}deg`,
    				`animation-delay: ${quadIn(/*i*/ ctx[12] / /*numberOfElements*/ ctx[0])}s`,
    				`animation-duration: ${/*durationInSeconds*/ ctx[1] * /*randomNumber*/ ctx[2](0.7, 1)}s`
    			].join(';'))) {
    				attr_dev(g0, "style", g0_style_value);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(g1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(45:2) {#each allElements as [element, color, scale], i}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let svg;
    	let each_value = /*allElements*/ ctx[3];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			svg = svg_element("svg");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			this.h();
    		},
    		l: function claim(nodes) {
    			svg = claim_svg_element(nodes, "svg", { class: true, viewBox: true });
    			var svg_nodes = children(svg);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].l(svg_nodes);
    			}

    			svg_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(svg, "class", "confetti svelte-15wt7c8");
    			attr_dev(svg, "viewBox", "-10 -10 10 10");
    			add_location(svg, file$4, 43, 0, 2378);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, svg, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				if (each_blocks[i]) {
    					each_blocks[i].m(svg, null);
    				}
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*allElements, Math, quadIn, numberOfElements, durationInSeconds, randomNumber*/ 15) {
    				each_value = /*allElements*/ ctx[3];
    				validate_each_argument(each_value);
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
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(svg);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('Confetti', slots, []);
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
    	const writable_props = ['numberOfElements', 'durationInSeconds', 'colors'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<Confetti> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('numberOfElements' in $$props) $$invalidate(0, numberOfElements = $$props.numberOfElements);
    		if ('durationInSeconds' in $$props) $$invalidate(1, durationInSeconds = $$props.durationInSeconds);
    		if ('colors' in $$props) $$invalidate(4, colors = $$props.colors);
    	};

    	$$self.$capture_state = () => ({
    		quadIn,
    		numberOfElements,
    		durationInSeconds,
    		colors,
    		pickFrom,
    		randomNumber,
    		getManyOf,
    		elementOptions,
    		allElements
    	});

    	$$self.$inject_state = $$props => {
    		if ('numberOfElements' in $$props) $$invalidate(0, numberOfElements = $$props.numberOfElements);
    		if ('durationInSeconds' in $$props) $$invalidate(1, durationInSeconds = $$props.durationInSeconds);
    		if ('colors' in $$props) $$invalidate(4, colors = $$props.colors);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [numberOfElements, durationInSeconds, randomNumber, allElements, colors];
    }

    class Confetti extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$4, create_fragment$4, safe_not_equal, {
    			numberOfElements: 0,
    			durationInSeconds: 1,
    			colors: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Confetti",
    			options,
    			id: create_fragment$4.name
    		});
    	}

    	get numberOfElements() {
    		throw new Error("<Confetti>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set numberOfElements(value) {
    		throw new Error("<Confetti>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get durationInSeconds() {
    		throw new Error("<Confetti>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set durationInSeconds(value) {
    		throw new Error("<Confetti>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get colors() {
    		throw new Error("<Confetti>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set colors(value) {
    		throw new Error("<Confetti>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\CompletedMessage.svelte generated by Svelte v3.59.2 */
    const file$3 = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\CompletedMessage.svelte";
    const get_footer_slot_changes$1 = dirty => ({});
    const get_footer_slot_context$1 = ctx => ({});
    const get_message_slot_changes$1 = dirty => ({});
    const get_message_slot_context$1 = ctx => ({});

    // (24:0) {#if isOpen}
    function create_if_block$1(ctx) {
    	let div3;
    	let div1;
    	let div0;
    	let t0;
    	let t1;
    	let div2;
    	let t2;
    	let div3_transition;
    	let t3;
    	let div4;
    	let div4_transition;
    	let current;
    	let mounted;
    	let dispose;
    	const message_slot_template = /*#slots*/ ctx[6].message;
    	const message_slot = create_slot(message_slot_template, ctx, /*$$scope*/ ctx[5], get_message_slot_context$1);
    	let if_block0 = /*outClickClose*/ ctx[1] && create_if_block_2$1(ctx);
    	const footer_slot_template = /*#slots*/ ctx[6].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[5], get_footer_slot_context$1);
    	let if_block1 = /*showConfetti*/ ctx[0] && create_if_block_1$1(ctx);

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			if (message_slot) message_slot.c();
    			t0 = space();
    			if (if_block0) if_block0.c();
    			t1 = space();
    			div2 = element("div");
    			if (footer_slot) footer_slot.c();
    			t2 = space();
    			if (if_block1) if_block1.c();
    			t3 = space();
    			div4 = element("div");
    			this.h();
    		},
    		l: function claim(nodes) {
    			div3 = claim_element(nodes, "DIV", { class: true });
    			var div3_nodes = children(div3);
    			div1 = claim_element(div3_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			div0 = claim_element(div1_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			if (message_slot) message_slot.l(div0_nodes);
    			div0_nodes.forEach(detach_dev);
    			t0 = claim_space(div1_nodes);
    			if (if_block0) if_block0.l(div1_nodes);
    			div1_nodes.forEach(detach_dev);
    			t1 = claim_space(div3_nodes);
    			div2 = claim_element(div3_nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			if (footer_slot) footer_slot.l(div2_nodes);
    			div2_nodes.forEach(detach_dev);
    			t2 = claim_space(div3_nodes);
    			if (if_block1) if_block1.l(div3_nodes);
    			div3_nodes.forEach(detach_dev);
    			t3 = claim_space(nodes);
    			div4 = claim_element(nodes, "DIV", { class: true });
    			children(div4).forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div0, "class", "message svelte-1l41rvq");
    			add_location(div0, file$3, 26, 6, 581);
    			attr_dev(div1, "class", "content svelte-1l41rvq");
    			add_location(div1, file$3, 25, 4, 553);
    			attr_dev(div2, "class", "footer");
    			add_location(div2, file$3, 35, 4, 756);
    			attr_dev(div3, "class", "completed svelte-1l41rvq");
    			add_location(div3, file$3, 24, 2, 495);
    			attr_dev(div4, "class", "curtain svelte-1l41rvq");
    			add_location(div4, file$3, 46, 2, 984);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div3, anchor);
    			append_hydration_dev(div3, div1);
    			append_hydration_dev(div1, div0);

    			if (message_slot) {
    				message_slot.m(div0, null);
    			}

    			append_hydration_dev(div1, t0);
    			if (if_block0) if_block0.m(div1, null);
    			append_hydration_dev(div3, t1);
    			append_hydration_dev(div3, div2);

    			if (footer_slot) {
    				footer_slot.m(div2, null);
    			}

    			append_hydration_dev(div3, t2);
    			if (if_block1) if_block1.m(div3, null);
    			insert_hydration_dev(target, t3, anchor);
    			insert_hydration_dev(target, div4, anchor);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div4, "click", /*close*/ ctx[3], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (message_slot) {
    				if (message_slot.p && (!current || dirty & /*$$scope*/ 32)) {
    					update_slot_base(
    						message_slot,
    						message_slot_template,
    						ctx,
    						/*$$scope*/ ctx[5],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[5])
    						: get_slot_changes(message_slot_template, /*$$scope*/ ctx[5], dirty, get_message_slot_changes$1),
    						get_message_slot_context$1
    					);
    				}
    			}

    			if (/*outClickClose*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_2$1(ctx);
    					if_block0.c();
    					if_block0.m(div1, null);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			if (footer_slot) {
    				if (footer_slot.p && (!current || dirty & /*$$scope*/ 32)) {
    					update_slot_base(
    						footer_slot,
    						footer_slot_template,
    						ctx,
    						/*$$scope*/ ctx[5],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[5])
    						: get_slot_changes(footer_slot_template, /*$$scope*/ ctx[5], dirty, get_footer_slot_changes$1),
    						get_footer_slot_context$1
    					);
    				}
    			}

    			if (/*showConfetti*/ ctx[0]) {
    				if (if_block1) {
    					if (dirty & /*showConfetti*/ 1) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block_1$1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div3, null);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(message_slot, local);
    			transition_in(footer_slot, local);
    			transition_in(if_block1);

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
    		o: function outro(local) {
    			transition_out(message_slot, local);
    			transition_out(footer_slot, local);
    			transition_out(if_block1);
    			if (!div3_transition) div3_transition = create_bidirectional_transition(div3, fade, { y: 20 }, false);
    			div3_transition.run(0);
    			if (!div4_transition) div4_transition = create_bidirectional_transition(div4, fade, { duration: 250 }, false);
    			div4_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			if (message_slot) message_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			if (footer_slot) footer_slot.d(detaching);
    			if (if_block1) if_block1.d();
    			if (detaching && div3_transition) div3_transition.end();
    			if (detaching) detach_dev(t3);
    			if (detaching) detach_dev(div4);
    			if (detaching && div4_transition) div4_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(24:0) {#if isOpen}",
    		ctx
    	});

    	return block;
    }

    // (31:6) {#if outClickClose}
    function create_if_block_2$1(ctx) {
    	let button;
    	let t;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			t = text("SHOP NOW");
    			this.h();
    		},
    		l: function claim(nodes) {
    			button = claim_element(nodes, "BUTTON", { class: true });
    			var button_nodes = children(button);
    			t = claim_text(button_nodes, "SHOP NOW");
    			button_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(button, "class", "svelte-1l41rvq");
    			add_location(button, file$3, 31, 8, 683);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, button, anchor);
    			append_hydration_dev(button, t);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*close*/ ctx[3], false, false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(31:6) {#if outClickClose}",
    		ctx
    	});

    	return block;
    }

    // (40:4) {#if showConfetti}
    function create_if_block_1$1(ctx) {
    	let div;
    	let confetti;
    	let current;
    	confetti = new Confetti({ $$inline: true });

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(confetti.$$.fragment);
    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			claim_component(confetti.$$.fragment, div_nodes);
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div, "class", "confetti svelte-1l41rvq");
    			add_location(div, file$3, 40, 6, 847);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);
    			mount_component(confetti, div, null);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(confetti.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(confetti.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(confetti);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(40:4) {#if showConfetti}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*isOpen*/ ctx[2] && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*isOpen*/ ctx[2]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*isOpen*/ 4) {
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
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('CompletedMessage', slots, ['message','footer']);
    	const dispatch = createEventDispatcher();
    	let { showConfetti = true } = $$props;
    	let { outClickClose = true } = $$props;
    	let { funcClose = false } = $$props;
    	let isOpen = true;

    	function close() {
    		if (outClickClose) {
    			$$invalidate(2, isOpen = false);
    		}

    		dispatch('messageClose', false);
    	}

    	const writable_props = ['showConfetti', 'outClickClose', 'funcClose'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CompletedMessage> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('showConfetti' in $$props) $$invalidate(0, showConfetti = $$props.showConfetti);
    		if ('outClickClose' in $$props) $$invalidate(1, outClickClose = $$props.outClickClose);
    		if ('funcClose' in $$props) $$invalidate(4, funcClose = $$props.funcClose);
    		if ('$$scope' in $$props) $$invalidate(5, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		fade,
    		Confetti,
    		createEventDispatcher,
    		dispatch,
    		showConfetti,
    		outClickClose,
    		funcClose,
    		isOpen,
    		close
    	});

    	$$self.$inject_state = $$props => {
    		if ('showConfetti' in $$props) $$invalidate(0, showConfetti = $$props.showConfetti);
    		if ('outClickClose' in $$props) $$invalidate(1, outClickClose = $$props.outClickClose);
    		if ('funcClose' in $$props) $$invalidate(4, funcClose = $$props.funcClose);
    		if ('isOpen' in $$props) $$invalidate(2, isOpen = $$props.isOpen);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*funcClose*/ 16) {
    			funcClose && $$invalidate(2, isOpen = false);
    		}
    	};

    	return [showConfetti, outClickClose, isOpen, close, funcClose, $$scope, slots];
    }

    class CompletedMessage extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$3, create_fragment$3, safe_not_equal, {
    			showConfetti: 0,
    			outClickClose: 1,
    			funcClose: 4
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CompletedMessage",
    			options,
    			id: create_fragment$3.name
    		});
    	}

    	get showConfetti() {
    		throw new Error("<CompletedMessage>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showConfetti(value) {
    		throw new Error("<CompletedMessage>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get outClickClose() {
    		throw new Error("<CompletedMessage>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set outClickClose(value) {
    		throw new Error("<CompletedMessage>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get funcClose() {
    		throw new Error("<CompletedMessage>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set funcClose(value) {
    		throw new Error("<CompletedMessage>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* C:\Users\Jackery\Downloads\svelte-crossword-main\src\CheckModal.svelte generated by Svelte v3.59.2 */
    const file$2 = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\CheckModal.svelte";

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
    	let p1;
    	let t5;
    	let t6;
    	let t7;
    	let button1;
    	let t8;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			button0 = element("button");
    			t0 = text("close");
    			t1 = space();
    			p0 = element("p");
    			t2 = text("CORRECT WORDS: ");
    			t3 = text(/*correct_num*/ ctx[0]);
    			t4 = space();
    			p1 = element("p");
    			t5 = text("INCORRECT WORDS: ");
    			t6 = text(/*error_num*/ ctx[1]);
    			t7 = space();
    			button1 = element("button");
    			t8 = text("open");
    			this.h();
    		},
    		l: function claim(nodes) {
    			div2 = claim_element(nodes, "DIV", { id: true, class: true });
    			var div2_nodes = children(div2);
    			div1 = claim_element(div2_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			div0 = claim_element(div1_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			button0 = claim_element(div0_nodes, "BUTTON", { class: true });
    			var button0_nodes = children(button0);
    			t0 = claim_text(button0_nodes, "close");
    			button0_nodes.forEach(detach_dev);
    			t1 = claim_space(div0_nodes);
    			p0 = claim_element(div0_nodes, "P", { class: true });
    			var p0_nodes = children(p0);
    			t2 = claim_text(p0_nodes, "CORRECT WORDS: ");
    			t3 = claim_text(p0_nodes, /*correct_num*/ ctx[0]);
    			p0_nodes.forEach(detach_dev);
    			t4 = claim_space(div0_nodes);
    			p1 = claim_element(div0_nodes, "P", { class: true });
    			var p1_nodes = children(p1);
    			t5 = claim_text(p1_nodes, "INCORRECT WORDS: ");
    			t6 = claim_text(p1_nodes, /*error_num*/ ctx[1]);
    			p1_nodes.forEach(detach_dev);
    			div0_nodes.forEach(detach_dev);
    			div1_nodes.forEach(detach_dev);
    			div2_nodes.forEach(detach_dev);
    			t7 = claim_space(nodes);
    			button1 = claim_element(nodes, "BUTTON", { class: true });
    			var button1_nodes = children(button1);
    			t8 = claim_text(button1_nodes, "open");
    			button1_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(button0, "class", "check__close svelte-1mkm0fc");
    			add_location(button0, file$2, 32, 6, 711);
    			attr_dev(p0, "class", "correct_text svelte-1mkm0fc");
    			add_location(p0, file$2, 34, 6, 788);
    			attr_dev(p1, "class", "incorrect_text svelte-1mkm0fc");
    			add_location(p1, file$2, 35, 6, 852);
    			attr_dev(div0, "class", "modal svelte-1mkm0fc");
    			add_location(div0, file$2, 31, 4, 684);
    			attr_dev(div1, "class", "modal-background svelte-1mkm0fc");
    			add_location(div1, file$2, 30, 2, 648);
    			attr_dev(div2, "id", "modal-container");
    			attr_dev(div2, "class", "svelte-1mkm0fc");
    			toggle_class(div2, "five", /*modalIn*/ ctx[2]);
    			toggle_class(div2, "out", /*out*/ ctx[3]);
    			add_location(div2, file$2, 25, 0, 558);
    			attr_dev(button1, "class", "check__open svelte-1mkm0fc");
    			add_location(button1, file$2, 40, 0, 944);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div2, anchor);
    			append_hydration_dev(div2, div1);
    			append_hydration_dev(div1, div0);
    			append_hydration_dev(div0, button0);
    			append_hydration_dev(button0, t0);
    			append_hydration_dev(div0, t1);
    			append_hydration_dev(div0, p0);
    			append_hydration_dev(p0, t2);
    			append_hydration_dev(p0, t3);
    			append_hydration_dev(div0, t4);
    			append_hydration_dev(div0, p1);
    			append_hydration_dev(p1, t5);
    			append_hydration_dev(p1, t6);
    			insert_hydration_dev(target, t7, anchor);
    			insert_hydration_dev(target, button1, anchor);
    			append_hydration_dev(button1, t8);

    			if (!mounted) {
    				dispose = [
    					listen_dev(button0, "click", /*closeModal*/ ctx[5], false, false, false, false),
    					listen_dev(button1, "click", /*openModal*/ ctx[4], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*correct_num*/ 1) set_data_dev(t3, /*correct_num*/ ctx[0]);
    			if (dirty & /*error_num*/ 2) set_data_dev(t6, /*error_num*/ ctx[1]);

    			if (dirty & /*modalIn*/ 4) {
    				toggle_class(div2, "five", /*modalIn*/ ctx[2]);
    			}

    			if (dirty & /*out*/ 8) {
    				toggle_class(div2, "out", /*out*/ ctx[3]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if (detaching) detach_dev(t7);
    			if (detaching) detach_dev(button1);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('CheckModal', slots, []);
    	const dispatch = createEventDispatcher();
    	let { open = false } = $$props;
    	let { correct_num = 0 } = $$props;
    	let { error_num = 0 } = $$props;
    	let modalIn = false;
    	let out = false;

    	function openModal() {
    		$$invalidate(2, modalIn = true);
    		$$invalidate(3, out = false);
    		dispatch('checkModalEvent', true);
    	}

    	function closeModal() {
    		$$invalidate(3, out = true);
    		dispatch('checkModalEvent', false);
    	}

    	const writable_props = ['open', 'correct_num', 'error_num'];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<CheckModal> was created with unknown prop '${key}'`);
    	});

    	$$self.$$set = $$props => {
    		if ('open' in $$props) $$invalidate(6, open = $$props.open);
    		if ('correct_num' in $$props) $$invalidate(0, correct_num = $$props.correct_num);
    		if ('error_num' in $$props) $$invalidate(1, error_num = $$props.error_num);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		dispatch,
    		open,
    		correct_num,
    		error_num,
    		modalIn,
    		out,
    		openModal,
    		closeModal
    	});

    	$$self.$inject_state = $$props => {
    		if ('open' in $$props) $$invalidate(6, open = $$props.open);
    		if ('correct_num' in $$props) $$invalidate(0, correct_num = $$props.correct_num);
    		if ('error_num' in $$props) $$invalidate(1, error_num = $$props.error_num);
    		if ('modalIn' in $$props) $$invalidate(2, modalIn = $$props.modalIn);
    		if ('out' in $$props) $$invalidate(3, out = $$props.out);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*open*/ 64) {
    			open && openModal();
    		}

    		if ($$self.$$.dirty & /*open*/ 64) {
    			!open && closeModal();
    		}
    	};

    	return [correct_num, error_num, modalIn, out, openModal, closeModal, open];
    }

    class CheckModal extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { open: 6, correct_num: 0, error_num: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "CheckModal",
    			options,
    			id: create_fragment$2.name
    		});
    	}

    	get open() {
    		throw new Error("<CheckModal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set open(value) {
    		throw new Error("<CheckModal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get correct_num() {
    		throw new Error("<CheckModal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set correct_num(value) {
    		throw new Error("<CheckModal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get error_num() {
    		throw new Error("<CheckModal>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set error_num(value) {
    		throw new Error("<CheckModal>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
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
            console.log("----------");
            console.log(data);
            console.log(cells);
            console.log(dict);
            console.log(d);
            console.log(d.id);
            console.log("----------");

    				failedCell = true;
    				console.error(`cell "${d.id}" has two different values\n`, `${dict[d.id]} and ${d.answer}`);
    			}
    		}
      });

    	return !failedProp && !failedCell;
    }

    function fromPairs(arr) {
      let res = {};
      arr.forEach((d) => {
        res[d[0]] = d[1];
      });
      return res;
    }

    var classic = {
    	"font": "sans-serif",
    	"primary-highlight-color": "#ffda00",
    	"secondary-highlight-color": "#a7d8ff",
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

    const { console: console_1 } = globals;
    const file$1 = "C:\\Users\\Jackery\\Downloads\\svelte-crossword-main\\src\\Crossword.svelte";
    const get_message_slot_changes_1 = dirty => ({});
    const get_message_slot_context_1 = ctx => ({ slot: "message" });
    const get_message_slot_changes = dirty => ({});
    const get_message_slot_context = ctx => ({ slot: "message" });
    const get_footer_slot_changes = dirty => ({});
    const get_footer_slot_context = ctx => ({ slot: "footer" });
    const get_toolbar_slot_changes = dirty => ({});

    const get_toolbar_slot_context = ctx => ({
    	onClear: /*onClear*/ ctx[29],
    	onReveal: /*onReveal*/ ctx[30],
    	onCheck: /*onCheck*/ ctx[31]
    });

    // (192:0) {#if validated}
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
    	const toolbar_slot_template = /*#slots*/ ctx[41].toolbar;
    	const toolbar_slot = create_slot(toolbar_slot_template, ctx, /*$$scope*/ ctx[50], get_toolbar_slot_context);
    	const toolbar_slot_or_fallback = toolbar_slot || fallback_block_3(ctx);

    	function clues_1_focusedCellIndex_binding(value) {
    		/*clues_1_focusedCellIndex_binding*/ ctx[42](value);
    	}

    	function clues_1_focusedCell_binding(value) {
    		/*clues_1_focusedCell_binding*/ ctx[43](value);
    	}

    	function clues_1_focusedDirection_binding(value) {
    		/*clues_1_focusedDirection_binding*/ ctx[44](value);
    	}

    	let clues_1_props = {
    		clues: /*clues*/ ctx[8],
    		cellIndexMap: /*cellIndexMap*/ ctx[26],
    		stacked: /*stacked*/ ctx[24],
    		isDisableHighlight: /*isDisableHighlight*/ ctx[25],
    		isLoaded: /*isLoaded*/ ctx[16]
    	};

    	if (/*focusedCellIndex*/ ctx[7] !== void 0) {
    		clues_1_props.focusedCellIndex = /*focusedCellIndex*/ ctx[7];
    	}

    	if (/*focusedCell*/ ctx[27] !== void 0) {
    		clues_1_props.focusedCell = /*focusedCell*/ ctx[27];
    	}

    	if (/*focusedDirection*/ ctx[14] !== void 0) {
    		clues_1_props.focusedDirection = /*focusedDirection*/ ctx[14];
    	}

    	clues_1 = new Clues({ props: clues_1_props, $$inline: true });
    	binding_callbacks.push(() => bind(clues_1, 'focusedCellIndex', clues_1_focusedCellIndex_binding));
    	binding_callbacks.push(() => bind(clues_1, 'focusedCell', clues_1_focusedCell_binding));
    	binding_callbacks.push(() => bind(clues_1, 'focusedDirection', clues_1_focusedDirection_binding));

    	function puzzle_cells_binding(value) {
    		/*puzzle_cells_binding*/ ctx[45](value);
    	}

    	function puzzle_focusedCellIndex_binding(value) {
    		/*puzzle_focusedCellIndex_binding*/ ctx[46](value);
    	}

    	function puzzle_focusedDirection_binding(value) {
    		/*puzzle_focusedDirection_binding*/ ctx[47](value);
    	}

    	let puzzle_props = {
    		clues: /*clues*/ ctx[8],
    		focusedCell: /*focusedCell*/ ctx[27],
    		isRevealing: /*isRevealing*/ ctx[15],
    		isChecking: /*isChecking*/ ctx[17],
    		isDisableHighlight: /*isDisableHighlight*/ ctx[25],
    		revealDuration: /*revealDuration*/ ctx[1],
    		showKeyboard: /*showKeyboard*/ ctx[4],
    		stacked: /*stacked*/ ctx[24],
    		isLoaded: /*isLoaded*/ ctx[16],
    		keyboardStyle: /*keyboardStyle*/ ctx[5]
    	};

    	if (/*cells*/ ctx[9] !== void 0) {
    		puzzle_props.cells = /*cells*/ ctx[9];
    	}

    	if (/*focusedCellIndex*/ ctx[7] !== void 0) {
    		puzzle_props.focusedCellIndex = /*focusedCellIndex*/ ctx[7];
    	}

    	if (/*focusedDirection*/ ctx[14] !== void 0) {
    		puzzle_props.focusedDirection = /*focusedDirection*/ ctx[14];
    	}

    	puzzle = new Puzzle({ props: puzzle_props, $$inline: true });
    	binding_callbacks.push(() => bind(puzzle, 'cells', puzzle_cells_binding));
    	binding_callbacks.push(() => bind(puzzle, 'focusedCellIndex', puzzle_focusedCellIndex_binding));
    	binding_callbacks.push(() => bind(puzzle, 'focusedDirection', puzzle_focusedDirection_binding));
    	let if_block0 = /*isComplete*/ ctx[10] && !/*isRevealing*/ ctx[15] && /*showCompleteMessage*/ ctx[2] && create_if_block_3(ctx);
    	let if_block1 = !/*isComplete*/ ctx[10] && !/*isRevealing*/ ctx[15] && !/*isSubscribe*/ ctx[28] && create_if_block_1(ctx);

    	const block = {
    		c: function create() {
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
    		l: function claim(nodes) {
    			article = claim_element(nodes, "ARTICLE", { class: true, style: true });
    			var article_nodes = children(article);
    			if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.l(article_nodes);
    			t0 = claim_space(article_nodes);
    			div = claim_element(article_nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			claim_component(clues_1.$$.fragment, div_nodes);
    			t1 = claim_space(div_nodes);
    			claim_component(puzzle.$$.fragment, div_nodes);
    			div_nodes.forEach(detach_dev);
    			t2 = claim_space(article_nodes);
    			if (if_block0) if_block0.l(article_nodes);
    			t3 = claim_space(article_nodes);
    			if (if_block1) if_block1.l(article_nodes);
    			article_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(div, "class", "play svelte-1bgyeht");
    			toggle_class(div, "stacked", /*stacked*/ ctx[24]);
    			toggle_class(div, "is-loaded", /*isLoaded*/ ctx[16]);
    			add_location(div, file$1, 206, 4, 5570);
    			attr_dev(article, "class", "svelte-crossword svelte-1bgyeht");
    			attr_dev(article, "style", /*inlineStyles*/ ctx[23]);
    			add_render_callback(() => /*article_elementresize_handler*/ ctx[49].call(article));
    			add_location(article, file$1, 192, 2, 5171);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, article, anchor);

    			if (toolbar_slot_or_fallback) {
    				toolbar_slot_or_fallback.m(article, null);
    			}

    			append_hydration_dev(article, t0);
    			append_hydration_dev(article, div);
    			mount_component(clues_1, div, null);
    			append_hydration_dev(div, t1);
    			mount_component(puzzle, div, null);
    			append_hydration_dev(article, t2);
    			if (if_block0) if_block0.m(article, null);
    			append_hydration_dev(article, t3);
    			if (if_block1) if_block1.m(article, null);
    			article_resize_listener = add_iframe_resize_listener(article, /*article_elementresize_handler*/ ctx[49].bind(article));
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (toolbar_slot) {
    				if (toolbar_slot.p && (!current || dirty[1] & /*$$scope*/ 524288)) {
    					update_slot_base(
    						toolbar_slot,
    						toolbar_slot_template,
    						ctx,
    						/*$$scope*/ ctx[50],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[50])
    						: get_slot_changes(toolbar_slot_template, /*$$scope*/ ctx[50], dirty, get_toolbar_slot_changes),
    						get_toolbar_slot_context
    					);
    				}
    			} else {
    				if (toolbar_slot_or_fallback && toolbar_slot_or_fallback.p && (!current || dirty[0] & /*checkModal, error_num, correct_num, actions*/ 14337)) {
    					toolbar_slot_or_fallback.p(ctx, !current ? [-1, -1] : dirty);
    				}
    			}

    			const clues_1_changes = {};
    			if (dirty[0] & /*clues*/ 256) clues_1_changes.clues = /*clues*/ ctx[8];
    			if (dirty[0] & /*cellIndexMap*/ 67108864) clues_1_changes.cellIndexMap = /*cellIndexMap*/ ctx[26];
    			if (dirty[0] & /*stacked*/ 16777216) clues_1_changes.stacked = /*stacked*/ ctx[24];
    			if (dirty[0] & /*isDisableHighlight*/ 33554432) clues_1_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[25];
    			if (dirty[0] & /*isLoaded*/ 65536) clues_1_changes.isLoaded = /*isLoaded*/ ctx[16];

    			if (!updating_focusedCellIndex && dirty[0] & /*focusedCellIndex*/ 128) {
    				updating_focusedCellIndex = true;
    				clues_1_changes.focusedCellIndex = /*focusedCellIndex*/ ctx[7];
    				add_flush_callback(() => updating_focusedCellIndex = false);
    			}

    			if (!updating_focusedCell && dirty[0] & /*focusedCell*/ 134217728) {
    				updating_focusedCell = true;
    				clues_1_changes.focusedCell = /*focusedCell*/ ctx[27];
    				add_flush_callback(() => updating_focusedCell = false);
    			}

    			if (!updating_focusedDirection && dirty[0] & /*focusedDirection*/ 16384) {
    				updating_focusedDirection = true;
    				clues_1_changes.focusedDirection = /*focusedDirection*/ ctx[14];
    				add_flush_callback(() => updating_focusedDirection = false);
    			}

    			clues_1.$set(clues_1_changes);
    			const puzzle_changes = {};
    			if (dirty[0] & /*clues*/ 256) puzzle_changes.clues = /*clues*/ ctx[8];
    			if (dirty[0] & /*focusedCell*/ 134217728) puzzle_changes.focusedCell = /*focusedCell*/ ctx[27];
    			if (dirty[0] & /*isRevealing*/ 32768) puzzle_changes.isRevealing = /*isRevealing*/ ctx[15];
    			if (dirty[0] & /*isChecking*/ 131072) puzzle_changes.isChecking = /*isChecking*/ ctx[17];
    			if (dirty[0] & /*isDisableHighlight*/ 33554432) puzzle_changes.isDisableHighlight = /*isDisableHighlight*/ ctx[25];
    			if (dirty[0] & /*revealDuration*/ 2) puzzle_changes.revealDuration = /*revealDuration*/ ctx[1];
    			if (dirty[0] & /*showKeyboard*/ 16) puzzle_changes.showKeyboard = /*showKeyboard*/ ctx[4];
    			if (dirty[0] & /*stacked*/ 16777216) puzzle_changes.stacked = /*stacked*/ ctx[24];
    			if (dirty[0] & /*isLoaded*/ 65536) puzzle_changes.isLoaded = /*isLoaded*/ ctx[16];
    			if (dirty[0] & /*keyboardStyle*/ 32) puzzle_changes.keyboardStyle = /*keyboardStyle*/ ctx[5];

    			if (!updating_cells && dirty[0] & /*cells*/ 512) {
    				updating_cells = true;
    				puzzle_changes.cells = /*cells*/ ctx[9];
    				add_flush_callback(() => updating_cells = false);
    			}

    			if (!updating_focusedCellIndex_1 && dirty[0] & /*focusedCellIndex*/ 128) {
    				updating_focusedCellIndex_1 = true;
    				puzzle_changes.focusedCellIndex = /*focusedCellIndex*/ ctx[7];
    				add_flush_callback(() => updating_focusedCellIndex_1 = false);
    			}

    			if (!updating_focusedDirection_1 && dirty[0] & /*focusedDirection*/ 16384) {
    				updating_focusedDirection_1 = true;
    				puzzle_changes.focusedDirection = /*focusedDirection*/ ctx[14];
    				add_flush_callback(() => updating_focusedDirection_1 = false);
    			}

    			puzzle.$set(puzzle_changes);

    			if (!current || dirty[0] & /*stacked*/ 16777216) {
    				toggle_class(div, "stacked", /*stacked*/ ctx[24]);
    			}

    			if (!current || dirty[0] & /*isLoaded*/ 65536) {
    				toggle_class(div, "is-loaded", /*isLoaded*/ ctx[16]);
    			}

    			if (/*isComplete*/ ctx[10] && !/*isRevealing*/ ctx[15] && /*showCompleteMessage*/ ctx[2]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*isComplete, isRevealing, showCompleteMessage*/ 33796) {
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

    			if (!/*isComplete*/ ctx[10] && !/*isRevealing*/ ctx[15] && !/*isSubscribe*/ ctx[28]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);

    					if (dirty[0] & /*isComplete, isRevealing*/ 33792) {
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

    			if (!current || dirty[0] & /*inlineStyles*/ 8388608) {
    				attr_dev(article, "style", /*inlineStyles*/ ctx[23]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(toolbar_slot_or_fallback, local);
    			transition_in(clues_1.$$.fragment, local);
    			transition_in(puzzle.$$.fragment, local);
    			transition_in(if_block0);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(toolbar_slot_or_fallback, local);
    			transition_out(clues_1.$$.fragment, local);
    			transition_out(puzzle.$$.fragment, local);
    			transition_out(if_block0);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(article);
    			if (toolbar_slot_or_fallback) toolbar_slot_or_fallback.d(detaching);
    			destroy_component(clues_1);
    			destroy_component(puzzle);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			article_resize_listener();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(192:0) {#if validated}",
    		ctx
    	});

    	return block;
    }

    // (202:26)        
    function fallback_block_3(ctx) {
    	let toolbar;
    	let t;
    	let checkmodal;
    	let current;

    	toolbar = new Toolbar({
    			props: { actions: /*actions*/ ctx[0] },
    			$$inline: true
    		});

    	toolbar.$on("event", /*onToolbarEvent*/ ctx[32]);

    	checkmodal = new CheckModal({
    			props: {
    				open: /*checkModal*/ ctx[11],
    				error_num: /*error_num*/ ctx[12],
    				correct_num: /*correct_num*/ ctx[13]
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(toolbar.$$.fragment);
    			t = space();
    			create_component(checkmodal.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(toolbar.$$.fragment, nodes);
    			t = claim_space(nodes);
    			claim_component(checkmodal.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(toolbar, target, anchor);
    			insert_hydration_dev(target, t, anchor);
    			mount_component(checkmodal, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const toolbar_changes = {};
    			if (dirty[0] & /*actions*/ 1) toolbar_changes.actions = /*actions*/ ctx[0];
    			toolbar.$set(toolbar_changes);
    			const checkmodal_changes = {};
    			if (dirty[0] & /*checkModal*/ 2048) checkmodal_changes.open = /*checkModal*/ ctx[11];
    			if (dirty[0] & /*error_num*/ 4096) checkmodal_changes.error_num = /*error_num*/ ctx[12];
    			if (dirty[0] & /*correct_num*/ 8192) checkmodal_changes.correct_num = /*correct_num*/ ctx[13];
    			checkmodal.$set(checkmodal_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(toolbar.$$.fragment, local);
    			transition_in(checkmodal.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(toolbar.$$.fragment, local);
    			transition_out(checkmodal.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(toolbar, detaching);
    			if (detaching) detach_dev(t);
    			destroy_component(checkmodal, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_3.name,
    		type: "fallback",
    		source: "(202:26)        ",
    		ctx
    	});

    	return block;
    }

    // (234:4) {#if isComplete && !isRevealing && showCompleteMessage}
    function create_if_block_3(ctx) {
    	let completedmessage;
    	let current;

    	completedmessage = new CompletedMessage({
    			props: {
    				showConfetti: /*showConfetti*/ ctx[3],
    				$$slots: {
    					footer: [create_footer_slot],
    					message: [create_message_slot_1]
    				},
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(completedmessage.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(completedmessage.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(completedmessage, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const completedmessage_changes = {};
    			if (dirty[0] & /*showConfetti*/ 8) completedmessage_changes.showConfetti = /*showConfetti*/ ctx[3];

    			if (dirty[1] & /*$$scope*/ 524288) {
    				completedmessage_changes.$$scope = { dirty, ctx };
    			}

    			completedmessage.$set(completedmessage_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(completedmessage.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(completedmessage.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(completedmessage, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(234:4) {#if isComplete && !isRevealing && showCompleteMessage}",
    		ctx
    	});

    	return block;
    }

    // (236:44)            
    function fallback_block_2(ctx) {
    	let h3;
    	let t0;
    	let t1;
    	let div;
    	let svg;
    	let style;
    	let t2;
    	let path;
    	let polygon;
    	let text0;
    	let t3;
    	let text1;
    	let tspan;
    	let t4;
    	let t5;
    	let text2;
    	let t6;
    	let circle;
    	let text3;
    	let t7;

    	const block = {
    		c: function create() {
    			h3 = element("h3");
    			t0 = text("Congratulations 🎉 You have successfully filled in the word:");
    			t1 = space();
    			div = element("div");
    			svg = svg_element("svg");
    			style = svg_element("style");
    			t2 = text(".st5{font-weight: bold;}._middle {font-weight: 500; font-size:14px; fill:#fff; text-anchor: middle;}._m {dominant-baseline: middle;}._d {dominant-baseline: alphabetic;}");
    			path = svg_element("path");
    			polygon = svg_element("polygon");
    			text0 = svg_element("text");
    			t3 = text("COPY & USE");
    			text1 = svg_element("text");
    			tspan = svg_element("tspan");
    			t4 = text("2%");
    			t5 = space();
    			text2 = svg_element("text");
    			t6 = text("Code:YUASDEFF");
    			circle = svg_element("circle");
    			text3 = svg_element("text");
    			t7 = text("GO");
    			this.h();
    		},
    		l: function claim(nodes) {
    			h3 = claim_element(nodes, "H3", { class: true });
    			var h3_nodes = children(h3);
    			t0 = claim_text(h3_nodes, "Congratulations 🎉 You have successfully filled in the word:");
    			h3_nodes.forEach(detach_dev);
    			t1 = claim_space(nodes);
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			svg = claim_svg_element(div_nodes, "svg", { viewBox: true });
    			var svg_nodes = children(svg);
    			style = claim_svg_element(svg_nodes, "style", { type: true });
    			var style_nodes = children(style);
    			t2 = claim_text(style_nodes, ".st5{font-weight: bold;}._middle {font-weight: 500; font-size:14px; fill:#fff; text-anchor: middle;}._m {dominant-baseline: middle;}._d {dominant-baseline: alphabetic;}");
    			style_nodes.forEach(detach_dev);
    			path = claim_svg_element(svg_nodes, "path", { fill: true, d: true });
    			children(path).forEach(detach_dev);
    			polygon = claim_svg_element(svg_nodes, "polygon", { fill: true, points: true });
    			children(polygon).forEach(detach_dev);

    			text0 = claim_svg_element(svg_nodes, "text", {
    				transform: true,
    				fill: true,
    				"font-size": true,
    				class: true
    			});

    			var text0_nodes = children(text0);
    			t3 = claim_text(text0_nodes, "COPY & USE");
    			text0_nodes.forEach(detach_dev);
    			text1 = claim_svg_element(svg_nodes, "text", { class: true, x: true, y: true });
    			var text1_nodes = children(text1);
    			tspan = claim_svg_element(text1_nodes, "tspan", { class: true, "font-size": true });
    			var tspan_nodes = children(tspan);
    			t4 = claim_text(tspan_nodes, "2%");
    			tspan_nodes.forEach(detach_dev);
    			t5 = claim_space(text1_nodes);
    			text1_nodes.forEach(detach_dev);
    			text2 = claim_svg_element(svg_nodes, "text", { transform: true, class: true });
    			var text2_nodes = children(text2);
    			t6 = claim_text(text2_nodes, "Code:YUASDEFF");
    			text2_nodes.forEach(detach_dev);

    			circle = claim_svg_element(svg_nodes, "circle", {
    				fill: true,
    				"stroke-width": true,
    				stroke: true,
    				cx: true,
    				cy: true,
    				r: true
    			});

    			children(circle).forEach(detach_dev);

    			text3 = claim_svg_element(svg_nodes, "text", {
    				transform: true,
    				fill: true,
    				"font-size": true,
    				class: true
    			});

    			var text3_nodes = children(text3);
    			t7 = claim_text(text3_nodes, "GO");
    			text3_nodes.forEach(detach_dev);
    			svg_nodes.forEach(detach_dev);
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(h3, "class", "title_gameend svelte-1bgyeht");
    			add_location(h3, file$1, 236, 10, 6553);
    			attr_dev(style, "type", "text/css");
    			add_location(style, file$1, 239, 14, 6739);
    			attr_dev(path, "fill", "#FD5000");
    			attr_dev(path, "d", "M214,0.2c0,4.4,3.6,8,8,8c4.4,0,8-3.6,8-8h108c0,4.4,3.6,8,8,8v78c-4.4,0-8,3.6-8,8l-108.1,0 c0-0.3,0.1-0.7,0.1-1c0-4.4-3.6-8-8-8c-4.4,0-8,3.6-8,8c0,0.3,0,0.7,0.1,1L8,94.2c0-4.4-3.6-8-8-8v-78c4.4,0,8-3.6,8-8H214z M222,67.2c-0.6,0-1,0.4-1,1v12c0,0.6,0.4,1,1,1c0.6,0,1-0.4,1-1v-12C223,67.7,222.6,67.2,222,67.2z M222,49.2c-0.6,0-1,0.4-1,1v12 c0,0.6,0.4,1,1,1c0.6,0,1-0.4,1-1v-12C223,49.7,222.6,49.2,222,49.2z M222,31.2c-0.6,0-1,0.4-1,1v12c0,0.6,0.4,1,1,1 c0.6,0,1-0.4,1-1v-12C223,31.7,222.6,31.2,222,31.2z M222,13.2c-0.6,0-1,0.4-1,1v12c0,0.6,0.4,1,1,1c0.6,0,1-0.4,1-1v-12 C223,13.7,222.6,13.2,222,13.2z");
    			add_location(path, file$1, 240, 14, 6953);
    			attr_dev(polygon, "fill", "#FFC879");
    			attr_dev(polygon, "points", "21.8,0 0,21.8 0,60.9 60.9,0");
    			add_location(polygon, file$1, 241, 14, 7591);
    			attr_dev(text0, "transform", "matrix(0.7 -0.7 0.7 0.7 7 40)");
    			attr_dev(text0, "fill", "#946040");
    			attr_dev(text0, "font-size", "8");
    			attr_dev(text0, "class", "st5");
    			add_location(text0, file$1, 242, 14, 7669);
    			attr_dev(tspan, "class", "st5");
    			attr_dev(tspan, "font-size", "45");
    			add_location(tspan, file$1, 244, 16, 7851);
    			attr_dev(text1, "class", "_middle _d");
    			attr_dev(text1, "x", "120");
    			attr_dev(text1, "y", "55");
    			add_location(text1, file$1, 243, 14, 7794);
    			attr_dev(text2, "transform", "matrix(1 0 0 1 284 76)");
    			attr_dev(text2, "class", "_middle _m");
    			add_location(text2, file$1, 246, 14, 7932);
    			attr_dev(circle, "fill", "none");
    			attr_dev(circle, "stroke-width", "1px");
    			attr_dev(circle, "stroke", "#fff");
    			attr_dev(circle, "cx", "285");
    			attr_dev(circle, "cy", "38.2");
    			attr_dev(circle, "r", "24.5");
    			add_location(circle, file$1, 247, 14, 8027);
    			attr_dev(text3, "transform", "matrix(1 0 0 1 266 47)");
    			attr_dev(text3, "fill", "#fff");
    			attr_dev(text3, "font-size", "24");
    			attr_dev(text3, "class", "st5");
    			add_location(text3, file$1, 248, 14, 8125);
    			attr_dev(svg, "viewBox", "0 0 346 94.2");
    			add_location(svg, file$1, 238, 12, 6696);
    			attr_dev(div, "class", "coupon_gameend svelte-1bgyeht");
    			add_location(div, file$1, 237, 10, 6655);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, h3, anchor);
    			append_hydration_dev(h3, t0);
    			insert_hydration_dev(target, t1, anchor);
    			insert_hydration_dev(target, div, anchor);
    			append_hydration_dev(div, svg);
    			append_hydration_dev(svg, style);
    			append_hydration_dev(style, t2);
    			append_hydration_dev(svg, path);
    			append_hydration_dev(svg, polygon);
    			append_hydration_dev(svg, text0);
    			append_hydration_dev(text0, t3);
    			append_hydration_dev(svg, text1);
    			append_hydration_dev(text1, tspan);
    			append_hydration_dev(tspan, t4);
    			append_hydration_dev(text1, t5);
    			append_hydration_dev(svg, text2);
    			append_hydration_dev(text2, t6);
    			append_hydration_dev(svg, circle);
    			append_hydration_dev(svg, text3);
    			append_hydration_dev(text3, t7);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(h3);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_2.name,
    		type: "fallback",
    		source: "(236:44)            ",
    		ctx
    	});

    	return block;
    }

    // (236:8) 
    function create_message_slot_1(ctx) {
    	let current;
    	const message_slot_template = /*#slots*/ ctx[41].message;
    	const message_slot = create_slot(message_slot_template, ctx, /*$$scope*/ ctx[50], get_message_slot_context);
    	const message_slot_or_fallback = message_slot || fallback_block_2(ctx);

    	const block = {
    		c: function create() {
    			if (message_slot_or_fallback) message_slot_or_fallback.c();
    		},
    		l: function claim(nodes) {
    			if (message_slot_or_fallback) message_slot_or_fallback.l(nodes);
    		},
    		m: function mount(target, anchor) {
    			if (message_slot_or_fallback) {
    				message_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (message_slot) {
    				if (message_slot.p && (!current || dirty[1] & /*$$scope*/ 524288)) {
    					update_slot_base(
    						message_slot,
    						message_slot_template,
    						ctx,
    						/*$$scope*/ ctx[50],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[50])
    						: get_slot_changes(message_slot_template, /*$$scope*/ ctx[50], dirty, get_message_slot_changes),
    						get_message_slot_context
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(message_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(message_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (message_slot_or_fallback) message_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_message_slot_1.name,
    		type: "slot",
    		source: "(236:8) ",
    		ctx
    	});

    	return block;
    }

    // (254:42)            
    function fallback_block_1(ctx) {
    	let div;
    	let t0;
    	let br;
    	let t1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t0 = text("This code will be sent to the email you provided.");
    			br = element("br");
    			t1 = text("\n            Use the stackable coupon code to earn up to 52% off during the Black Friday Sale.");
    			this.h();
    		},
    		l: function claim(nodes) {
    			div = claim_element(nodes, "DIV", { class: true });
    			var div_nodes = children(div);
    			t0 = claim_text(div_nodes, "This code will be sent to the email you provided.");
    			br = claim_element(div_nodes, "BR", {});
    			t1 = claim_text(div_nodes, "\n            Use the stackable coupon code to earn up to 52% off during the Black Friday Sale.");
    			div_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			add_location(br, file$1, 255, 61, 8411);
    			attr_dev(div, "class", "footer_gameend svelte-1bgyeht");
    			add_location(div, file$1, 254, 10, 8321);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div, anchor);
    			append_hydration_dev(div, t0);
    			append_hydration_dev(div, br);
    			append_hydration_dev(div, t1);
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block_1.name,
    		type: "fallback",
    		source: "(254:42)            ",
    		ctx
    	});

    	return block;
    }

    // (254:8) 
    function create_footer_slot(ctx) {
    	let current;
    	const footer_slot_template = /*#slots*/ ctx[41].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[50], get_footer_slot_context);
    	const footer_slot_or_fallback = footer_slot || fallback_block_1(ctx);

    	const block = {
    		c: function create() {
    			if (footer_slot_or_fallback) footer_slot_or_fallback.c();
    		},
    		l: function claim(nodes) {
    			if (footer_slot_or_fallback) footer_slot_or_fallback.l(nodes);
    		},
    		m: function mount(target, anchor) {
    			if (footer_slot_or_fallback) {
    				footer_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (footer_slot) {
    				if (footer_slot.p && (!current || dirty[1] & /*$$scope*/ 524288)) {
    					update_slot_base(
    						footer_slot,
    						footer_slot_template,
    						ctx,
    						/*$$scope*/ ctx[50],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[50])
    						: get_slot_changes(footer_slot_template, /*$$scope*/ ctx[50], dirty, get_footer_slot_changes),
    						get_footer_slot_context
    					);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(footer_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(footer_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (footer_slot_or_fallback) footer_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_footer_slot.name,
    		type: "slot",
    		source: "(254:8) ",
    		ctx
    	});

    	return block;
    }

    // (263:4) {#if !isComplete && !isRevealing && !isSubscribe}
    function create_if_block_1(ctx) {
    	let completedmessage;
    	let current;

    	completedmessage = new CompletedMessage({
    			props: {
    				showConfetti: false,
    				outClickClose: false,
    				funcClose: /*subscribeModalClose*/ ctx[21],
    				$$slots: { message: [create_message_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(completedmessage.$$.fragment);
    		},
    		l: function claim(nodes) {
    			claim_component(completedmessage.$$.fragment, nodes);
    		},
    		m: function mount(target, anchor) {
    			mount_component(completedmessage, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const completedmessage_changes = {};
    			if (dirty[0] & /*subscribeModalClose*/ 2097152) completedmessage_changes.funcClose = /*subscribeModalClose*/ ctx[21];

    			if (dirty[0] & /*subscribeLoading, subscribe_error, subscribe_email*/ 5767168 | dirty[1] & /*$$scope*/ 524288) {
    				completedmessage_changes.$$scope = { dirty, ctx };
    			}

    			completedmessage.$set(completedmessage_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(completedmessage.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(completedmessage.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(completedmessage, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(263:4) {#if !isComplete && !isRevealing && !isSubscribe}",
    		ctx
    	});

    	return block;
    }

    // (280:14) {#if subscribeLoading}
    function create_if_block_2(ctx) {
    	let span;
    	let svg;
    	let path;
    	let t;

    	const block = {
    		c: function create() {
    			span = element("span");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t = text("\n                Loading");
    			this.h();
    		},
    		l: function claim(nodes) {
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
    			children(path).forEach(detach_dev);
    			svg_nodes.forEach(detach_dev);
    			t = claim_text(span_nodes, "\n                Loading");
    			span_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(path, "d", "M988 548c-19.9 0-36-16.1-36-36 0-59.4-11.6-117-34.6-171.3a440.45 440.45 0 00-94.3-139.9 437.71 437.71 0 00-139.9-94.3C629 83.6 571.4 72 512 72c-19.9 0-36-16.1-36-36s16.1-36 36-36c69.1 0 136.2 13.5 199.3 40.3C772.3 66 827 103 874 150c47 47 83.9 101.8 109.7 162.7 26.7 63.1 40.2 130.2 40.2 199.3.1 19.9-16 36-35.9 36z");
    			add_location(path, file$1, 281, 171, 9721);
    			attr_dev(svg, "class", "anticon-loading svelte-1bgyeht");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "focusable", "false");
    			attr_dev(svg, "data-icon", "loading");
    			attr_dev(svg, "width", "1em");
    			attr_dev(svg, "height", "1em");
    			attr_dev(svg, "fill", "currentColor");
    			attr_dev(svg, "aria-hidden", "true");
    			add_location(svg, file$1, 281, 16, 9566);
    			attr_dev(span, "class", "crossword_submit_loading svelte-1bgyeht");
    			add_location(span, file$1, 280, 14, 9510);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, span, anchor);
    			append_hydration_dev(span, svg);
    			append_hydration_dev(svg, path);
    			append_hydration_dev(span, t);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(280:14) {#if subscribeLoading}",
    		ctx
    	});

    	return block;
    }

    // (266:44)            
    function fallback_block(ctx) {
    	let div2;
    	let h3;
    	let t0;
    	let br;
    	let t1;
    	let strong;
    	let t2;
    	let t3;
    	let t4;
    	let input;
    	let t5;
    	let div0;
    	let t6;
    	let t7;
    	let div1;
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
    	let if_block = /*subscribeLoading*/ ctx[22] && create_if_block_2(ctx);

    	const block = {
    		c: function create() {
    			div2 = element("div");
    			h3 = element("h3");
    			t0 = text("Subscribe to solve the crossword puzzle");
    			br = element("br");
    			t1 = text("\n              Win up to ");
    			strong = element("strong");
    			t2 = text("52%");
    			t3 = text(" off");
    			t4 = space();
    			input = element("input");
    			t5 = space();
    			div0 = element("div");
    			t6 = text("请输入正确的邮箱");
    			t7 = space();
    			div1 = element("div");
    			t8 = text("PLAY NOW\n              ");
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
    		l: function claim(nodes) {
    			div2 = claim_element(nodes, "DIV", { class: true });
    			var div2_nodes = children(div2);
    			h3 = claim_element(div2_nodes, "H3", { class: true });
    			var h3_nodes = children(h3);
    			t0 = claim_text(h3_nodes, "Subscribe to solve the crossword puzzle");
    			br = claim_element(h3_nodes, "BR", {});
    			t1 = claim_text(h3_nodes, "\n              Win up to ");
    			strong = claim_element(h3_nodes, "STRONG", { class: true });
    			var strong_nodes = children(strong);
    			t2 = claim_text(strong_nodes, "52%");
    			strong_nodes.forEach(detach_dev);
    			t3 = claim_text(h3_nodes, " off");
    			h3_nodes.forEach(detach_dev);
    			t4 = claim_space(div2_nodes);

    			input = claim_element(div2_nodes, "INPUT", {
    				type: true,
    				placeholder: true,
    				class: true
    			});

    			t5 = claim_space(div2_nodes);
    			div0 = claim_element(div2_nodes, "DIV", { class: true });
    			var div0_nodes = children(div0);
    			t6 = claim_text(div0_nodes, "请输入正确的邮箱");
    			div0_nodes.forEach(detach_dev);
    			t7 = claim_space(div2_nodes);
    			div1 = claim_element(div2_nodes, "DIV", { class: true });
    			var div1_nodes = children(div1);
    			t8 = claim_text(div1_nodes, "PLAY NOW\n              ");
    			if (if_block) if_block.l(div1_nodes);
    			div1_nodes.forEach(detach_dev);
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

    			children(path0).forEach(detach_dev);

    			path1 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path1).forEach(detach_dev);

    			path2 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path2).forEach(detach_dev);

    			path3 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path3).forEach(detach_dev);

    			path4 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path4).forEach(detach_dev);

    			path5 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path5).forEach(detach_dev);

    			path6 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path6).forEach(detach_dev);
    			path7 = claim_svg_element(svg_nodes, "path", { d: true, fill: true });
    			children(path7).forEach(detach_dev);
    			path8 = claim_svg_element(svg_nodes, "path", { d: true, fill: true });
    			children(path8).forEach(detach_dev);

    			path9 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path9).forEach(detach_dev);

    			path10 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path10).forEach(detach_dev);

    			path11 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path11).forEach(detach_dev);
    			path12 = claim_svg_element(svg_nodes, "path", { d: true, fill: true });
    			children(path12).forEach(detach_dev);

    			path13 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path13).forEach(detach_dev);

    			path14 = claim_svg_element(svg_nodes, "path", {
    				d: true,
    				stroke: true,
    				"stroke-width": true,
    				"stroke-linecap": true,
    				"stroke-linejoin": true
    			});

    			children(path14).forEach(detach_dev);

    			path15 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path15).forEach(detach_dev);
    			path16 = claim_svg_element(svg_nodes, "path", { d: true, fill: true });
    			children(path16).forEach(detach_dev);

    			path17 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path17).forEach(detach_dev);

    			path18 = claim_svg_element(svg_nodes, "path", {
    				d: true,
    				stroke: true,
    				"stroke-width": true,
    				"stroke-linecap": true,
    				"stroke-linejoin": true
    			});

    			children(path18).forEach(detach_dev);

    			path19 = claim_svg_element(svg_nodes, "path", {
    				d: true,
    				stroke: true,
    				"stroke-width": true,
    				"stroke-linecap": true,
    				"stroke-linejoin": true
    			});

    			children(path19).forEach(detach_dev);

    			path20 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path20).forEach(detach_dev);

    			path21 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path21).forEach(detach_dev);

    			path22 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path22).forEach(detach_dev);

    			path23 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path23).forEach(detach_dev);

    			path24 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path24).forEach(detach_dev);

    			path25 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path25).forEach(detach_dev);

    			path26 = claim_svg_element(svg_nodes, "path", {
    				"fill-rule": true,
    				"clip-rule": true,
    				d: true,
    				fill: true
    			});

    			children(path26).forEach(detach_dev);

    			path27 = claim_svg_element(svg_nodes, "path", {
    				d: true,
    				stroke: true,
    				"stroke-width": true,
    				"stroke-linecap": true,
    				"stroke-linejoin": true
    			});

    			children(path27).forEach(detach_dev);
    			svg_nodes.forEach(detach_dev);
    			div2_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			add_location(br, file$1, 268, 53, 8972);
    			attr_dev(strong, "class", "svelte-1bgyeht");
    			add_location(strong, file$1, 269, 24, 9001);
    			attr_dev(h3, "class", "svelte-1bgyeht");
    			add_location(h3, file$1, 267, 12, 8914);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "placeholder", "Email");
    			attr_dev(input, "class", "svelte-1bgyeht");
    			add_location(input, file$1, 271, 12, 9057);
    			attr_dev(div0, "class", "error__tips svelte-1bgyeht");
    			toggle_class(div0, "active", /*subscribe_error*/ ctx[20]);
    			add_location(div0, file$1, 272, 12, 9191);
    			attr_dev(div1, "class", "crossword_subscribe_submit svelte-1bgyeht");
    			toggle_class(div1, "loading", /*subscribeLoading*/ ctx[22]);
    			add_location(div1, file$1, 273, 12, 9276);
    			attr_dev(path0, "fill-rule", "evenodd");
    			attr_dev(path0, "clip-rule", "evenodd");
    			attr_dev(path0, "d", "M84.3672 20.2232C83.8654 19.3658 83.8488 18.3209 84.1549 17.3752C86.6335 9.69678 75.7514 8.42302 72.3299 7.30917C68.7595 6.14569 70.4909 0.0332954 63.6727 0.00021073C56.8572 -0.0328739 55.9226 3.84079 55.5973 3.84079C55.1203 3.84079 58.3047 9.53687 58.3047 9.53687C58.3047 9.53687 61.6931 9.51757 63.6534 15.6713C65.6164 21.8278 65.0402 25.5499 70.4137 29.1285C75.7872 32.7072 88.7757 21.5356 88.7757 21.5356C86.2668 22.3296 84.9985 21.3067 84.3644 20.2232H84.3672Z");
    			attr_dev(path0, "fill", "#5C3420");
    			add_location(path0, file$1, 288, 14, 10306);
    			attr_dev(path1, "fill-rule", "evenodd");
    			attr_dev(path1, "clip-rule", "evenodd");
    			attr_dev(path1, "d", "M56.0108 171.39C56.0108 171.39 61.1059 137.324 54.5275 123.842L58.12 77.6279L36.5791 79.114L51.095 171.66L56.0108 171.393V171.39Z");
    			attr_dev(path1, "fill", "#E3633D");
    			add_location(path1, file$1, 289, 14, 10853);
    			attr_dev(path2, "fill-rule", "evenodd");
    			attr_dev(path2, "clip-rule", "evenodd");
    			attr_dev(path2, "d", "M50.935 170.053L46.6588 173.166C45.8179 173.935 41.2329 175.429 41.2329 175.429C40.7752 176.386 41.6685 176.888 42.4267 177.014L55.9611 176.73C55.9611 176.73 59.0849 176.082 56.314 170.058C53.852 171.145 51.5774 171.925 50.935 170.05V170.053Z");
    			attr_dev(path2, "fill", "#4A2A1A");
    			add_location(path2, file$1, 290, 14, 11064);
    			attr_dev(path3, "fill-rule", "evenodd");
    			attr_dev(path3, "clip-rule", "evenodd");
    			attr_dev(path3, "d", "M35.0793 86.3373L39.4879 125.383L46.6176 164.712H59.0685C59.0685 164.712 58.3654 157.05 58.5391 154.886C58.7128 152.722 61.0012 133.24 56.1956 123.795L57.406 85.116L35.0793 86.3401V86.3373Z");
    			attr_dev(path3, "fill", "#C9D9B9");
    			add_location(path3, file$1, 291, 14, 11388);
    			attr_dev(path4, "fill-rule", "evenodd");
    			attr_dev(path4, "clip-rule", "evenodd");
    			attr_dev(path4, "d", "M71.9355 128.234L91.8746 165.242C95.7455 166.642 95.9909 164.392 94.8991 160.795C90.3251 145.187 92.3322 135.661 79.4568 121.746L71.9355 128.234Z");
    			attr_dev(path4, "fill", "#E3633D");
    			add_location(path4, file$1, 292, 14, 11659);
    			attr_dev(path5, "fill-rule", "evenodd");
    			attr_dev(path5, "clip-rule", "evenodd");
    			attr_dev(path5, "d", "M52.7629 83.2027L64.5218 121.746C65.0043 123.555 66.0988 126.152 66.959 127.815L85.9303 161.404L95.9164 155.664C95.9164 155.664 94.0388 151.013 93.628 148.961C91.2322 137.04 88.6516 131.848 79.3134 118.642L75.1916 79.114L65.0015 79.5221L52.7657 83.2027H52.7629Z");
    			attr_dev(path5, "fill", "#C9D9B9");
    			add_location(path5, file$1, 293, 14, 11886);
    			attr_dev(path6, "fill-rule", "evenodd");
    			attr_dev(path6, "clip-rule", "evenodd");
    			attr_dev(path6, "d", "M91.6815 165.145L91.5299 170.433C91.6264 171.569 90.0024 176.113 90.0024 176.113C90.4794 177.058 91.4251 176.659 91.9875 176.137L100.038 165.255C100.038 165.255 101.436 162.385 94.9734 160.896C94.3283 163.51 93.5535 165.785 91.6787 165.148L91.6815 165.145Z");
    			attr_dev(path6, "fill", "#4A2A1A");
    			add_location(path6, file$1, 294, 14, 12229);
    			attr_dev(path7, "d", "M23.7476 34.957C18.2225 28.5634 16.4139 25.8615 11.0128 19.3135L5.20093 20.0027C14.0731 34.764 14.3213 40.7303 20.6542 44.4303C28.0073 41.8414 24.6906 36.7105 23.7449 34.9543L23.7476 34.957Z");
    			attr_dev(path7, "fill", "#C95836");
    			add_location(path7, file$1, 295, 14, 12567);
    			attr_dev(path8, "d", "M10.9964 19.3326L7.82308 16.4846C7.18896 15.9166 6.37287 15.5913 5.52094 15.5748L2.07186 15.5031C0.869781 15.4783 0.0123394 16.661 0.412113 17.7969L4.60008 21.1523C5.5237 21.8912 6.76989 22.2854 8.09052 22.2496L10.2879 22.1917L10.9964 19.3354V19.3326Z");
    			attr_dev(path8, "fill", "#C95836");
    			add_location(path8, file$1, 296, 14, 12799);
    			attr_dev(path9, "fill-rule", "evenodd");
    			attr_dev(path9, "clip-rule", "evenodd");
    			attr_dev(path9, "d", "M44.8721 19.6499C44.8721 19.6499 17.1995 37.2565 18.6277 40.9206L19.2149 42.5555C19.9786 44.6785 22.5344 45.5194 24.4092 44.2621L38.3764 34.8937L41.1363 33.1347L44.8721 19.6499Z");
    			attr_dev(path9, "fill", "#C95836");
    			add_location(path9, file$1, 297, 14, 13092);
    			attr_dev(path10, "fill-rule", "evenodd");
    			attr_dev(path10, "clip-rule", "evenodd");
    			attr_dev(path10, "d", "M67.3973 54.7278L37.9574 56.9693C33.1684 58.7283 35.0818 86.3374 35.0818 86.3374L54.4391 87.2335C63.4326 87.046 74.0694 94.0986 75.1887 79.114C76.468 61.9844 67.3973 54.7278 67.3973 54.7278Z");
    			attr_dev(path10, "fill", "#C9D9B9");
    			add_location(path10, file$1, 298, 14, 13351);
    			attr_dev(path11, "fill-rule", "evenodd");
    			attr_dev(path11, "clip-rule", "evenodd");
    			attr_dev(path11, "d", "M44.8723 19.6498L55.6717 18.2686L58.6383 18.354L69.9478 22.1615C73.7635 23.9977 75.5694 28.3897 74.1633 32.3985L71.5441 45.3235C74.5769 55.0201 76.1649 61.8218 75.7624 71.8382C59.8514 77.9423 37.886 77.8871 32.7661 70.6113C33.4002 50.5647 37.2298 32.6273 44.8723 19.6498Z");
    			attr_dev(path11, "fill", "#8CA671");
    			add_location(path11, file$1, 299, 14, 13623);
    			attr_dev(path12, "d", "M49.7797 19.0515C49.7797 19.0515 46.3307 27.8575 52.3548 28.1801C58.379 28.4999 61.5744 19.3492 61.5744 19.3492L57.1576 17.4441L49.7797 19.0515Z");
    			attr_dev(path12, "fill", "#C95836");
    			add_location(path12, file$1, 300, 14, 13976);
    			attr_dev(path13, "fill-rule", "evenodd");
    			attr_dev(path13, "clip-rule", "evenodd");
    			attr_dev(path13, "d", "M7.07593 24.2623L12.6921 20.3639L23.304 32.7458L41.2359 21.089C41.2359 21.089 43.1686 19.8648 44.8724 19.647C46.5763 19.4292 39.4686 35.1306 39.4686 35.1306L25.9949 45.0175C25.9949 45.0175 19.9845 48.7726 16.869 42.9028C13.7563 37.033 7.07593 24.2623 7.07593 24.2623Z");
    			attr_dev(path13, "fill", "#8CA671");
    			add_location(path13, file$1, 301, 14, 14162);
    			attr_dev(path14, "d", "M38.0513 35.9827L40.5409 29.6084");
    			attr_dev(path14, "stroke", "#3A6B26");
    			attr_dev(path14, "stroke-width", "0.725106");
    			attr_dev(path14, "stroke-linecap", "round");
    			attr_dev(path14, "stroke-linejoin", "round");
    			add_location(path14, file$1, 302, 14, 14511);
    			attr_dev(path15, "fill-rule", "evenodd");
    			attr_dev(path15, "clip-rule", "evenodd");
    			attr_dev(path15, "d", "M80.1929 55.4225C84.0059 54.0826 87.8244 55.1606 89.6854 59.3789L94.3779 81.6063L89.7406 80.9694L83.5868 65.1577L80.1929 55.4225Z");
    			attr_dev(path15, "fill", "#C95836");
    			add_location(path15, file$1, 303, 14, 14658);
    			attr_dev(path16, "d", "M89.5588 80.3603L90.8519 84.2698C91.1111 85.05 91.6404 85.7007 92.3462 86.1032L95.2025 87.7299C96.1978 88.2951 97.4826 87.6554 97.6922 86.4892L95.7898 81.6781C95.3707 80.6167 94.5133 79.7124 93.3912 79.1444L91.5219 78.1987L89.5588 80.3575V80.3603Z");
    			attr_dev(path16, "fill", "#C95836");
    			add_location(path16, file$1, 304, 14, 14869);
    			attr_dev(path17, "fill-rule", "evenodd");
    			attr_dev(path17, "clip-rule", "evenodd");
    			attr_dev(path17, "d", "M73.4851 25.4011L87.6205 51.2044L93.7549 74.882L86.3605 78.3338L78.0728 55.8583L69.7024 41.6126L73.4851 25.4011Z");
    			attr_dev(path17, "fill", "#8CA671");
    			add_location(path17, file$1, 305, 14, 15158);
    			attr_dev(path18, "d", "M56.7191 97.0735C56.3718 95.0305 53.3555 85.334 53.3555 85.334H50.3035");
    			attr_dev(path18, "stroke", "#939C89");
    			attr_dev(path18, "stroke-width", "0.675479");
    			attr_dev(path18, "stroke-linecap", "round");
    			attr_dev(path18, "stroke-linejoin", "round");
    			add_location(path18, file$1, 306, 14, 15352);
    			attr_dev(path19, "d", "M71.1361 43.6003L67.1494 34.1574L67.4334 32.2495");
    			attr_dev(path19, "stroke", "#3A6B26");
    			attr_dev(path19, "stroke-width", "0.725106");
    			attr_dev(path19, "stroke-linecap", "round");
    			attr_dev(path19, "stroke-linejoin", "round");
    			add_location(path19, file$1, 307, 14, 15537);
    			attr_dev(path20, "fill-rule", "evenodd");
    			attr_dev(path20, "clip-rule", "evenodd");
    			attr_dev(path20, "d", "M52.9118 3.25635C52.9118 3.25635 47.0035 3.25635 48.5502 10.0966C50.0803 16.8569 56.7882 9.61688 56.7882 9.61688L52.9118 3.25635Z");
    			attr_dev(path20, "fill", "#5C3420");
    			add_location(path20, file$1, 308, 14, 15700);
    			attr_dev(path21, "fill-rule", "evenodd");
    			attr_dev(path21, "clip-rule", "evenodd");
    			attr_dev(path21, "d", "M51.572 12.5394C51.572 12.5394 51.9497 16.8239 52.2613 20.3722C52.344 21.3179 52.9092 22.1478 53.7418 22.542C54.5717 22.939 55.5394 22.837 56.2728 22.2801C56.5127 22.0981 56.747 21.9189 56.9676 21.7508C57.9712 20.9871 58.4564 19.6857 58.2138 18.4064C57.5907 15.1311 56.4575 9.16479 56.4575 9.16479L51.572 12.5367V12.5394Z");
    			attr_dev(path21, "fill", "#C95836");
    			add_location(path21, file$1, 309, 14, 15911);
    			attr_dev(path22, "fill-rule", "evenodd");
    			attr_dev(path22, "clip-rule", "evenodd");
    			attr_dev(path22, "d", "M51.7043 14.4665L52.0104 17.0361C53.8107 16.606 54.8722 15.0152 55.7793 13.179L51.7043 14.4665Z");
    			attr_dev(path22, "fill", "#873B24");
    			add_location(path22, file$1, 310, 14, 16314);
    			attr_dev(path23, "fill-rule", "evenodd");
    			attr_dev(path23, "clip-rule", "evenodd");
    			attr_dev(path23, "d", "M58.1172 8.67659C58.4287 7.52138 57.7836 6.32206 56.678 5.99673C55.4952 5.64934 54.0064 5.21373 52.8236 4.8691C51.7153 4.54376 50.7338 5.28265 50.254 6.37445C49.6888 7.66199 49.1319 10.5155 48.972 12.6385C48.881 13.835 49.4572 15.1309 50.5656 15.4562C51.7484 15.8036 55.6055 15.6657 56.5429 13.5593C57.257 11.9575 57.6595 10.3777 58.1172 8.67659Z");
    			attr_dev(path23, "fill", "#C95836");
    			add_location(path23, file$1, 311, 14, 16491);
    			attr_dev(path24, "fill-rule", "evenodd");
    			attr_dev(path24, "clip-rule", "evenodd");
    			attr_dev(path24, "d", "M49.6612 11.8997L51.5939 12.4235C51.5939 12.4235 51.2135 13.791 50.3119 13.4243C49.4103 13.0576 49.6612 11.8997 49.6612 11.8997Z");
    			attr_dev(path24, "fill", "white");
    			add_location(path24, file$1, 312, 14, 16919);
    			attr_dev(path25, "fill-rule", "evenodd");
    			attr_dev(path25, "clip-rule", "evenodd");
    			attr_dev(path25, "d", "M51.2246 4.60457C51.2246 4.60457 53.1518 10.9017 55.3905 11.5468C56.5402 11.8777 56.3748 13.5678 57.2433 14.2708C58.8175 15.5446 61.8503 11.0892 61.6077 9.07927C61.2493 6.11543 60.5131 4.96298 57.1688 3.46039C55.1258 2.54229 52.7493 1.38984 51.2246 4.60457Z");
    			attr_dev(path25, "fill", "#5C3420");
    			add_location(path25, file$1, 313, 14, 17127);
    			attr_dev(path26, "fill-rule", "evenodd");
    			attr_dev(path26, "clip-rule", "evenodd");
    			attr_dev(path26, "d", "M58.1087 13.6255C57.5573 14.4278 56.5951 14.6897 55.961 14.2155C55.3269 13.7385 55.258 12.7046 55.8094 11.9023C56.3608 11.1 57.323 10.8381 57.9571 11.3123C58.5912 11.7893 58.6602 12.8232 58.1087 13.6255Z");
    			attr_dev(path26, "fill", "#C95836");
    			add_location(path26, file$1, 314, 14, 17466);
    			attr_dev(path27, "d", "M56.7083 2.90063C57.5436 3.52649 58.7126 4.70926 58.7126 4.70926");
    			attr_dev(path27, "stroke", "#BFAB9E");
    			attr_dev(path27, "stroke-width", "0.802303");
    			attr_dev(path27, "stroke-linecap", "round");
    			attr_dev(path27, "stroke-linejoin", "round");
    			add_location(path27, file$1, 315, 14, 17751);
    			attr_dev(svg, "class", "crossword_subscribe_icon svelte-1bgyeht");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "width", "101");
    			attr_dev(svg, "height", "178");
    			attr_dev(svg, "viewBox", "0 0 101 178");
    			attr_dev(svg, "fill", "none");
    			add_location(svg, file$1, 287, 12, 10159);
    			attr_dev(div2, "class", "crossword_subscribe_container svelte-1bgyeht");
    			add_location(div2, file$1, 266, 10, 8858);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, div2, anchor);
    			append_hydration_dev(div2, h3);
    			append_hydration_dev(h3, t0);
    			append_hydration_dev(h3, br);
    			append_hydration_dev(h3, t1);
    			append_hydration_dev(h3, strong);
    			append_hydration_dev(strong, t2);
    			append_hydration_dev(h3, t3);
    			append_hydration_dev(div2, t4);
    			append_hydration_dev(div2, input);
    			set_input_value(input, /*subscribe_email*/ ctx[19]);
    			append_hydration_dev(div2, t5);
    			append_hydration_dev(div2, div0);
    			append_hydration_dev(div0, t6);
    			append_hydration_dev(div2, t7);
    			append_hydration_dev(div2, div1);
    			append_hydration_dev(div1, t8);
    			if (if_block) if_block.m(div1, null);
    			append_hydration_dev(div2, t9);
    			append_hydration_dev(div2, svg);
    			append_hydration_dev(svg, path0);
    			append_hydration_dev(svg, path1);
    			append_hydration_dev(svg, path2);
    			append_hydration_dev(svg, path3);
    			append_hydration_dev(svg, path4);
    			append_hydration_dev(svg, path5);
    			append_hydration_dev(svg, path6);
    			append_hydration_dev(svg, path7);
    			append_hydration_dev(svg, path8);
    			append_hydration_dev(svg, path9);
    			append_hydration_dev(svg, path10);
    			append_hydration_dev(svg, path11);
    			append_hydration_dev(svg, path12);
    			append_hydration_dev(svg, path13);
    			append_hydration_dev(svg, path14);
    			append_hydration_dev(svg, path15);
    			append_hydration_dev(svg, path16);
    			append_hydration_dev(svg, path17);
    			append_hydration_dev(svg, path18);
    			append_hydration_dev(svg, path19);
    			append_hydration_dev(svg, path20);
    			append_hydration_dev(svg, path21);
    			append_hydration_dev(svg, path22);
    			append_hydration_dev(svg, path23);
    			append_hydration_dev(svg, path24);
    			append_hydration_dev(svg, path25);
    			append_hydration_dev(svg, path26);
    			append_hydration_dev(svg, path27);

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "input", /*handleEmail*/ ctx[33], false, false, false, false),
    					listen_dev(input, "change", /*handleEmail*/ ctx[33], false, false, false, false),
    					listen_dev(input, "input", /*input_input_handler*/ ctx[48]),
    					listen_dev(div1, "click", /*handSubscribe*/ ctx[34], false, false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*subscribe_email*/ 524288 && input.value !== /*subscribe_email*/ ctx[19]) {
    				set_input_value(input, /*subscribe_email*/ ctx[19]);
    			}

    			if (dirty[0] & /*subscribe_error*/ 1048576) {
    				toggle_class(div0, "active", /*subscribe_error*/ ctx[20]);
    			}

    			if (/*subscribeLoading*/ ctx[22]) {
    				if (if_block) ; else {
    					if_block = create_if_block_2(ctx);
    					if_block.c();
    					if_block.m(div1, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty[0] & /*subscribeLoading*/ 4194304) {
    				toggle_class(div1, "loading", /*subscribeLoading*/ ctx[22]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div2);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: fallback_block.name,
    		type: "fallback",
    		source: "(266:44)            ",
    		ctx
    	});

    	return block;
    }

    // (266:8) 
    function create_message_slot(ctx) {
    	let current;
    	const message_slot_template = /*#slots*/ ctx[41].message;
    	const message_slot = create_slot(message_slot_template, ctx, /*$$scope*/ ctx[50], get_message_slot_context_1);
    	const message_slot_or_fallback = message_slot || fallback_block(ctx);

    	const block = {
    		c: function create() {
    			if (message_slot_or_fallback) message_slot_or_fallback.c();
    		},
    		l: function claim(nodes) {
    			if (message_slot_or_fallback) message_slot_or_fallback.l(nodes);
    		},
    		m: function mount(target, anchor) {
    			if (message_slot_or_fallback) {
    				message_slot_or_fallback.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (message_slot) {
    				if (message_slot.p && (!current || dirty[1] & /*$$scope*/ 524288)) {
    					update_slot_base(
    						message_slot,
    						message_slot_template,
    						ctx,
    						/*$$scope*/ ctx[50],
    						!current
    						? get_all_dirty_from_scope(/*$$scope*/ ctx[50])
    						: get_slot_changes(message_slot_template, /*$$scope*/ ctx[50], dirty, get_message_slot_changes_1),
    						get_message_slot_context_1
    					);
    				}
    			} else {
    				if (message_slot_or_fallback && message_slot_or_fallback.p && (!current || dirty[0] & /*subscribeLoading, subscribe_error, subscribe_email*/ 5767168)) {
    					message_slot_or_fallback.p(ctx, !current ? [-1, -1] : dirty);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(message_slot_or_fallback, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(message_slot_or_fallback, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (message_slot_or_fallback) message_slot_or_fallback.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_message_slot.name,
    		type: "slot",
    		source: "(266:8) ",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*validated*/ ctx[18] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			if (if_block) if_block.l(nodes);
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_hydration_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (/*validated*/ ctx[18]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty[0] & /*validated*/ 262144) {
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
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
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
    	validate_slots('Crossword', slots, ['toolbar','footer','message']);
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
    	let clueCompletion;
    	let originalClues = [];
    	let validated = [];
    	let clues = [];
    	let cells = [];

    	// 订阅相关
    	let isSubscribe = window.localStorage.getItem("__jky_cwd") || false;

    	let subscribe_email = '';
    	let subscribe_error = false;
    	let subscribeModalClose = false;
    	let subscribeLoading = false;

    	const onDataUpdate = () => {
    		originalClues = createClues(data);
    		$$invalidate(18, validated = validateClues(originalClues));
    		$$invalidate(8, clues = originalClues.map(d => ({ ...d })));
    		$$invalidate(9, cells = createCells(originalClues));
    		reset();
    	};

    	onMount(() => {
    		$$invalidate(16, isLoaded = true);
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
    		$$invalidate(15, isRevealing = false);
    		$$invalidate(17, isChecking = false);
    		$$invalidate(7, focusedCellIndex = 0);
    		$$invalidate(14, focusedDirection = "across");
    	}

    	function onClear() {
    		reset();
    		if (revealTimeout) clearTimeout(revealTimeout);

    		$$invalidate(9, cells = cells.map(cell => ({
    			...cell,
    			value: cell.show ? cell.answer : ""
    		})));
    	}

    	function onReveal() {
    		if (revealed) return true;
    		reset();
    		$$invalidate(9, cells = cells.map(cell => ({ ...cell, value: cell.answer })));
    		startReveal();
    	}

    	function onCheck() {
    		$$invalidate(17, isChecking = true);
    		const res = getCheckRes() || { error: '', correct: '' };
    		console.info("check resaults: 错误单词数：", res.error.length, "正确单词数：", res.correct.length);
    		$$invalidate(12, error_num = res.error.length);
    		$$invalidate(13, correct_num = res.correct.length);
    		$$invalidate(11, checkModal = true);

    		setTimeout(
    			() => {
    				$$invalidate(17, isChecking = false);
    				$$invalidate(11, checkModal = false);
    			},
    			3500
    		);
    	}

    	function startReveal() {
    		$$invalidate(15, isRevealing = true);
    		$$invalidate(17, isChecking = false);
    		if (revealTimeout) clearTimeout(revealTimeout);

    		revealTimeout = setTimeout(
    			() => {
    				$$invalidate(15, isRevealing = false);
    			},
    			revealDuration + 250
    		);
    	}

    	function onToolbarEvent({ detail }) {
    		if (detail === "clear") onClear(); else if (detail === "reveal") onReveal(); else if (detail === "check") onCheck();
    	}

    	function handleEmail(e) {
    		$$invalidate(20, subscribe_error = !verifyEmail(subscribe_email));
    	}

    	function handSubscribe() {
    		$$invalidate(20, subscribe_error = !verifyEmail(subscribe_email));

    		if (!subscribe_error) {
    			$$invalidate(22, subscribeLoading = true);

    			footerPhoneSubs({ email: subscribe_email, tags: "CP_games" }).then(res => {
    				console.log(res);
    				$$invalidate(21, subscribeModalClose = true);
    				$$invalidate(22, subscribeLoading = false);
    				window.localStorage.setItem("__jky_cwd", '1');
    			});
    		}
    	}

    	$$self.$$.on_mount.push(function () {
    		if (showKeyboard === undefined && !('showKeyboard' in $$props || $$self.$$.bound[$$self.$$.props['showKeyboard']])) {
    			console_1.warn("<Crossword> was created without expected prop 'showKeyboard'");
    		}
    	});

    	const writable_props = [
    		'data',
    		'actions',
    		'theme',
    		'revealDuration',
    		'breakpoint',
    		'revealed',
    		'disableHighlight',
    		'showCompleteMessage',
    		'showConfetti',
    		'showKeyboard',
    		'keyboardStyle'
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console_1.warn(`<Crossword> was created with unknown prop '${key}'`);
    	});

    	function clues_1_focusedCellIndex_binding(value) {
    		focusedCellIndex = value;
    		$$invalidate(7, focusedCellIndex);
    	}

    	function clues_1_focusedCell_binding(value) {
    		focusedCell = value;
    		(($$invalidate(27, focusedCell), $$invalidate(9, cells)), $$invalidate(7, focusedCellIndex));
    	}

    	function clues_1_focusedDirection_binding(value) {
    		focusedDirection = value;
    		$$invalidate(14, focusedDirection);
    	}

    	function puzzle_cells_binding(value) {
    		cells = value;
    		$$invalidate(9, cells);
    	}

    	function puzzle_focusedCellIndex_binding(value) {
    		focusedCellIndex = value;
    		$$invalidate(7, focusedCellIndex);
    	}

    	function puzzle_focusedDirection_binding(value) {
    		focusedDirection = value;
    		$$invalidate(14, focusedDirection);
    	}

    	function input_input_handler() {
    		subscribe_email = this.value;
    		$$invalidate(19, subscribe_email);
    	}

    	function article_elementresize_handler() {
    		width = this.offsetWidth;
    		$$invalidate(6, width);
    	}

    	$$self.$$set = $$props => {
    		if ('data' in $$props) $$invalidate(36, data = $$props.data);
    		if ('actions' in $$props) $$invalidate(0, actions = $$props.actions);
    		if ('theme' in $$props) $$invalidate(37, theme = $$props.theme);
    		if ('revealDuration' in $$props) $$invalidate(1, revealDuration = $$props.revealDuration);
    		if ('breakpoint' in $$props) $$invalidate(38, breakpoint = $$props.breakpoint);
    		if ('revealed' in $$props) $$invalidate(35, revealed = $$props.revealed);
    		if ('disableHighlight' in $$props) $$invalidate(39, disableHighlight = $$props.disableHighlight);
    		if ('showCompleteMessage' in $$props) $$invalidate(2, showCompleteMessage = $$props.showCompleteMessage);
    		if ('showConfetti' in $$props) $$invalidate(3, showConfetti = $$props.showConfetti);
    		if ('showKeyboard' in $$props) $$invalidate(4, showKeyboard = $$props.showKeyboard);
    		if ('keyboardStyle' in $$props) $$invalidate(5, keyboardStyle = $$props.keyboardStyle);
    		if ('$$scope' in $$props) $$invalidate(50, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		onMount,
    		Toolbar,
    		Puzzle,
    		Clues,
    		CompletedMessage,
    		CheckModal,
    		footerPhoneSubs,
    		createClues,
    		createCells,
    		validateClues,
    		fromPairs,
    		themeStyles: themes,
    		data,
    		actions,
    		theme,
    		revealDuration,
    		breakpoint,
    		revealed,
    		disableHighlight,
    		showCompleteMessage,
    		showConfetti,
    		showKeyboard,
    		keyboardStyle,
    		checkModal,
    		error_num,
    		correct_num,
    		width,
    		focusedDirection,
    		focusedCellIndex,
    		isRevealing,
    		isLoaded,
    		isChecking,
    		revealTimeout,
    		clueCompletion,
    		originalClues,
    		validated,
    		clues,
    		cells,
    		isSubscribe,
    		subscribe_email,
    		subscribe_error,
    		subscribeModalClose,
    		subscribeLoading,
    		onDataUpdate,
    		checkClues,
    		getCheckRes,
    		reset,
    		onClear,
    		onReveal,
    		onCheck,
    		startReveal,
    		onToolbarEvent,
    		verifyEmail,
    		handleEmail,
    		handSubscribe,
    		inlineStyles,
    		stacked,
    		isComplete,
    		isDisableHighlight,
    		percentCorrect,
    		cellIndexMap,
    		focusedCell
    	});

    	$$self.$inject_state = $$props => {
    		if ('data' in $$props) $$invalidate(36, data = $$props.data);
    		if ('actions' in $$props) $$invalidate(0, actions = $$props.actions);
    		if ('theme' in $$props) $$invalidate(37, theme = $$props.theme);
    		if ('revealDuration' in $$props) $$invalidate(1, revealDuration = $$props.revealDuration);
    		if ('breakpoint' in $$props) $$invalidate(38, breakpoint = $$props.breakpoint);
    		if ('revealed' in $$props) $$invalidate(35, revealed = $$props.revealed);
    		if ('disableHighlight' in $$props) $$invalidate(39, disableHighlight = $$props.disableHighlight);
    		if ('showCompleteMessage' in $$props) $$invalidate(2, showCompleteMessage = $$props.showCompleteMessage);
    		if ('showConfetti' in $$props) $$invalidate(3, showConfetti = $$props.showConfetti);
    		if ('showKeyboard' in $$props) $$invalidate(4, showKeyboard = $$props.showKeyboard);
    		if ('keyboardStyle' in $$props) $$invalidate(5, keyboardStyle = $$props.keyboardStyle);
    		if ('checkModal' in $$props) $$invalidate(11, checkModal = $$props.checkModal);
    		if ('error_num' in $$props) $$invalidate(12, error_num = $$props.error_num);
    		if ('correct_num' in $$props) $$invalidate(13, correct_num = $$props.correct_num);
    		if ('width' in $$props) $$invalidate(6, width = $$props.width);
    		if ('focusedDirection' in $$props) $$invalidate(14, focusedDirection = $$props.focusedDirection);
    		if ('focusedCellIndex' in $$props) $$invalidate(7, focusedCellIndex = $$props.focusedCellIndex);
    		if ('isRevealing' in $$props) $$invalidate(15, isRevealing = $$props.isRevealing);
    		if ('isLoaded' in $$props) $$invalidate(16, isLoaded = $$props.isLoaded);
    		if ('isChecking' in $$props) $$invalidate(17, isChecking = $$props.isChecking);
    		if ('revealTimeout' in $$props) revealTimeout = $$props.revealTimeout;
    		if ('clueCompletion' in $$props) clueCompletion = $$props.clueCompletion;
    		if ('originalClues' in $$props) originalClues = $$props.originalClues;
    		if ('validated' in $$props) $$invalidate(18, validated = $$props.validated);
    		if ('clues' in $$props) $$invalidate(8, clues = $$props.clues);
    		if ('cells' in $$props) $$invalidate(9, cells = $$props.cells);
    		if ('isSubscribe' in $$props) $$invalidate(28, isSubscribe = $$props.isSubscribe);
    		if ('subscribe_email' in $$props) $$invalidate(19, subscribe_email = $$props.subscribe_email);
    		if ('subscribe_error' in $$props) $$invalidate(20, subscribe_error = $$props.subscribe_error);
    		if ('subscribeModalClose' in $$props) $$invalidate(21, subscribeModalClose = $$props.subscribeModalClose);
    		if ('subscribeLoading' in $$props) $$invalidate(22, subscribeLoading = $$props.subscribeLoading);
    		if ('inlineStyles' in $$props) $$invalidate(23, inlineStyles = $$props.inlineStyles);
    		if ('stacked' in $$props) $$invalidate(24, stacked = $$props.stacked);
    		if ('isComplete' in $$props) $$invalidate(10, isComplete = $$props.isComplete);
    		if ('isDisableHighlight' in $$props) $$invalidate(25, isDisableHighlight = $$props.isDisableHighlight);
    		if ('percentCorrect' in $$props) $$invalidate(40, percentCorrect = $$props.percentCorrect);
    		if ('cellIndexMap' in $$props) $$invalidate(26, cellIndexMap = $$props.cellIndexMap);
    		if ('focusedCell' in $$props) $$invalidate(27, focusedCell = $$props.focusedCell);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[1] & /*data*/ 32) {
    			(onDataUpdate());
    		}

    		if ($$self.$$.dirty[0] & /*cells, focusedCellIndex*/ 640) {
    			$$invalidate(27, focusedCell = cells[focusedCellIndex] || {});
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 512) {
    			$$invalidate(26, cellIndexMap = fromPairs(cells.map(cell => [cell.id, cell.index])));
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 512) {
    			$$invalidate(40, percentCorrect = cells.filter(d => d.answer === d.value).length / cells.length);
    		}

    		if ($$self.$$.dirty[1] & /*percentCorrect*/ 512) {
    			$$invalidate(10, isComplete = percentCorrect == 1);
    		}

    		if ($$self.$$.dirty[0] & /*isComplete*/ 1024 | $$self.$$.dirty[1] & /*disableHighlight*/ 256) {
    			$$invalidate(25, isDisableHighlight = isComplete && disableHighlight);
    		}

    		if ($$self.$$.dirty[0] & /*cells*/ 512) {
    			($$invalidate(8, clues = checkClues()));
    		}

    		if ($$self.$$.dirty[0] & /*cells, clues*/ 768) {
    			($$invalidate(35, revealed = !clues.filter(d => !d.isCorrect).length));
    		}

    		if ($$self.$$.dirty[0] & /*width*/ 64 | $$self.$$.dirty[1] & /*breakpoint*/ 128) {
    			$$invalidate(24, stacked = width < breakpoint);
    		}

    		if ($$self.$$.dirty[1] & /*theme*/ 64) {
    			$$invalidate(23, inlineStyles = themes[theme]);
    		}
    	};

    	return [
    		actions,
    		revealDuration,
    		showCompleteMessage,
    		showConfetti,
    		showKeyboard,
    		keyboardStyle,
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
    		subscribe_error,
    		subscribeModalClose,
    		subscribeLoading,
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
    		handSubscribe,
    		revealed,
    		data,
    		theme,
    		breakpoint,
    		disableHighlight,
    		percentCorrect,
    		slots,
    		clues_1_focusedCellIndex_binding,
    		clues_1_focusedCell_binding,
    		clues_1_focusedDirection_binding,
    		puzzle_cells_binding,
    		puzzle_focusedCellIndex_binding,
    		puzzle_focusedDirection_binding,
    		input_input_handler,
    		article_elementresize_handler,
    		$$scope
    	];
    }

    class Crossword extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$1,
    			create_fragment$1,
    			safe_not_equal,
    			{
    				data: 36,
    				actions: 0,
    				theme: 37,
    				revealDuration: 1,
    				breakpoint: 38,
    				revealed: 35,
    				disableHighlight: 39,
    				showCompleteMessage: 2,
    				showConfetti: 3,
    				showKeyboard: 4,
    				keyboardStyle: 5
    			},
    			null,
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Crossword",
    			options,
    			id: create_fragment$1.name
    		});
    	}

    	get data() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set data(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get actions() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set actions(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get theme() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set theme(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get revealDuration() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set revealDuration(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get breakpoint() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set breakpoint(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get revealed() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set revealed(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disableHighlight() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disableHighlight(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showCompleteMessage() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showCompleteMessage(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showConfetti() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showConfetti(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get showKeyboard() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set showKeyboard(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get keyboardStyle() {
    		throw new Error("<Crossword>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set keyboardStyle(value) {
    		throw new Error("<Crossword>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
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
    			1
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
    			1
    		]
    	},
    	{
    		clue: "电池快充",
    		answer: "Fastcharging",
    		direction: "down",
    		x: 8,
    		y: 0,
    		uncheck: [
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
    			6
    		]
    	}
    ];

    /* App.svelte generated by Svelte v3.59.2 */
    const file = "App.svelte";

    function create_fragment(ctx) {
    	let article;
    	let section;
    	let crossword;
    	let current;
    	crossword = new Crossword({ props: { data: jac }, $$inline: true });

    	const block = {
    		c: function create() {
    			article = element("article");
    			section = element("section");
    			create_component(crossword.$$.fragment);
    			this.h();
    		},
    		l: function claim(nodes) {
    			article = claim_element(nodes, "ARTICLE", { class: true });
    			var article_nodes = children(article);
    			section = claim_element(article_nodes, "SECTION", { id: true, class: true });
    			var section_nodes = children(section);
    			claim_component(crossword.$$.fragment, section_nodes);
    			section_nodes.forEach(detach_dev);
    			article_nodes.forEach(detach_dev);
    			this.h();
    		},
    		h: function hydrate() {
    			attr_dev(section, "id", "default");
    			attr_dev(section, "class", "svelte-ic8ad6");
    			add_location(section, file, 7, 2, 129);
    			attr_dev(article, "class", "svelte-ic8ad6");
    			add_location(article, file, 6, 0, 117);
    		},
    		m: function mount(target, anchor) {
    			insert_hydration_dev(target, article, anchor);
    			append_hydration_dev(article, section);
    			mount_component(crossword, section, null);
    			current = true;
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;
    			transition_in(crossword.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(crossword.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(article);
    			destroy_component(crossword);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots('App', slots, []);
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== '$$' && key !== 'slot') console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	$$self.$capture_state = () => ({ Crossword, jac });
    	return [];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment.name
    		});
    	}
    }

    const app = new App({
    	target: document.querySelector("main"),
    	hydrate: true
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
