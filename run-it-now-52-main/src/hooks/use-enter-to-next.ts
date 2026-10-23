import { useCallback, type KeyboardEventHandler } from "react";

const FIELD_SELECTOR = [
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[role='combobox']",
].join(",");

function isNavigableField(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.matches(":disabled") || element.tabIndex < 0) {
    return false;
  }
  if (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    element.readOnly
  ) {
    return false;
  }
  if (
    element instanceof HTMLInputElement &&
    ["checkbox", "radio", "button", "submit", "reset"].includes(element.type)
  ) {
    return false;
  }
  if (
    element.getAttribute("aria-readonly") === "true" ||
    element.getAttribute("aria-hidden") === "true"
  )
    return false;
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0
  );
}

export function focusNextField(form: HTMLFormElement, current: Element | null) {
  const ordered = Array.from(form.querySelectorAll(FIELD_SELECTOR));
  const fields = ordered.filter(isNavigableField);
  const currentIndex = current ? ordered.indexOf(current) : -1;
  const next = fields.find((field) => ordered.indexOf(field) > currentIndex);
  if (next) {
    next.focus();
  } else {
    form.requestSubmit();
  }
}

export function useEnterToNext(): KeyboardEventHandler<HTMLFormElement> {
  return useCallback((event) => {
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.currentTarget.dataset.enterNav === "off"
    )
      return;

    const form = event.currentTarget;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (event.shiftKey && target instanceof HTMLTextAreaElement) return;

    if (
      target.matches("[aria-readonly='true']") ||
      ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) &&
        target.readOnly)
    ) {
      event.preventDefault();
      focusNextField(form, target);
      return;
    }

    if (target.getAttribute("role") === "combobox") {
      return;
    }

    if (target instanceof HTMLSelectElement) {
      let timeout = 0;
      const cleanup = () => {
        target.removeEventListener("change", onChange);
        target.removeEventListener("blur", cleanup);
        window.clearTimeout(timeout);
      };
      const onChange = () => {
        cleanup();
        window.setTimeout(() => focusNextField(form, target), 0);
      };
      target.addEventListener("change", onChange, { once: true });
      target.addEventListener("blur", cleanup, { once: true });
      timeout = window.setTimeout(cleanup, 30000);
      return;
    }

    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) return;
    if (target.disabled) return;

    event.preventDefault();
    focusNextField(form, target);
  }, []);
}
