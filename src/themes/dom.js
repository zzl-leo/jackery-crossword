/**
 * 设置焦点到指定元素中
 *
 * @param {Element} container - 焦点父容器
 * @param {Element} elementToFocus - 焦点元素
 * @param {Object} options - Settings unique to your theme
 * @param {string} options.className - Class name to apply to element on focus.
 */
const trapFocusHandlers = {};
export function getFocusableElements(container) {
    return Array.from(
        container.querySelectorAll(
            "summary, a[href], button:enabled, [tabindex]:not([tabindex^='-']), [draggable], area, input:not([type=hidden]):enabled, select:enabled, textarea:enabled, object, iframe"
        )
    )
}

export function trapFocus(container, elementToFocus = container) {
    const elements = getFocusableElements(container);
    const first = elements[0];
    const last = elements[elements.length - 1];
    removeTrapFocus();

    trapFocusHandlers.focusin = (event) => {
        if (event.target !== container && event.target !== last && event.target !== first) {
            return
        }

        document.addEventListener('keydown', trapFocusHandlers.keydown);
    };

    trapFocusHandlers.focusout = function () {
        document.removeEventListener('keydown', trapFocusHandlers.keydown);
    };

    trapFocusHandlers.keydown = function (event) {
        if (event.code.toUpperCase() !== 'TAB') return; // If not TAB key
        // On the last focusable element and tab forward, focus the first element.
        if (event.target === last && !event.shiftKey) {
            event.preventDefault();
            first.focus();
        }

        //  On the first focusable element and tab backward, focus the last element.
        if (
            (event.target === container || event.target === first) &&
            event.shiftKey
        ) {
            event.preventDefault();
            last.focus();
        }
    };

    document.addEventListener('focusout', trapFocusHandlers.focusout);
    document.addEventListener('focusin', trapFocusHandlers.focusin);

    // elementToFocus && $(elementToFocus).focus();
    document.isFocusAfterUpdated = true
    if (document.isFocusAfterUpdated) {
        elementToFocus && $(elementToFocus).focus();
        // focus标志量还原
        document.isFocusAfterUpdated = false
    }
}
export function removeTrapFocus(elementToFocus = null) {
    document.removeEventListener('focusin', trapFocusHandlers.focusin);
    document.removeEventListener('focusout', trapFocusHandlers.focusout);
    document.removeEventListener('keydown', trapFocusHandlers.keydown);

    if (elementToFocus) elementToFocus.focus();
}