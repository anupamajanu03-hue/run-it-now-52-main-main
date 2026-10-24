import { useCallback, type KeyboardEventHandler } from "react";

const FIELD_SELECTOR = [
  "input:not([type='hidden']):not([type='search'])",
  "select",
  "[role='combobox']",
].join(",");

function isNavigableField(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.matches(":disabled") || element.tabIndex < 0) {
    return false;
  }
  if (element.getAttribute("aria-disabled") === "true" || element.closest("[inert]")) return false;
  if (
    (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
    element.readOnly
  ) {
    return false;
  }
  if (
    element instanceof HTMLInputElement &&
    ["hidden", "search", "checkbox", "radio", "button", "submit", "reset", "image", "file"].includes(
      element.type,
    )
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

function orderedFields(form: HTMLFormElement, includeTextareas = false) {
  return Array.from(
    form.querySelectorAll(includeTextareas ? `${FIELD_SELECTOR}, textarea` : FIELD_SELECTOR),
  )
    .filter(isNavigableField)
    .sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return a.top - b.top || a.left - b.left;
    });
}

function focusFirstInvalidField(form: HTMLFormElement) {
  const fields = orderedFields(form, true);
  const invalid = fields.find((field) => {
    if (field.matches(":invalid, [aria-invalid='true']")) return true;
    let parent = field.parentElement;
    while (parent && parent !== form) {
      if (
        Array.from(parent.children).some(
          (child) =>
            child instanceof HTMLElement &&
            child.matches(".text-destructive") &&
            !!child.textContent?.trim(),
        )
      ) {
        return true;
      }
      parent = parent.parentElement;
    }
    return false;
  });
  if (invalid) {
    invalid.focus();
    return;
  }
  const errorText = Array.from(form.querySelectorAll("[role='alert'], .text-destructive"))
    .map((error) => error.textContent?.trim().toLowerCase() ?? "")
    .filter(Boolean)
    .join(" ");
  if (!errorText) return;

  const matchingLabel = fields.find((field) => {
    const label = field.id
      ? Array.from(form.querySelectorAll("label[for]")).find(
          (item) => item.getAttribute("for") === field.id,
        )?.textContent
      : field.getAttribute("aria-label");
    const normalizedLabel = label?.trim().toLowerCase();
    return !!normalizedLabel && errorText.includes(normalizedLabel);
  });
  if (matchingLabel) {
    matchingLabel.focus();
    return;
  }

  const empty = fields.find(
    (field) =>
      (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) &&
      !field.value.trim(),
  );
  (empty ?? fields[0])?.focus();
}

function isPopupOpen(target: HTMLElement) {
  if (target.getAttribute("aria-expanded") === "true") return true;
  try {
    return target.matches(":open");
  } catch {
    return false;
  }
}

function moveToField(form: HTMLFormElement, current: HTMLElement, backwards: boolean) {
  const fields = orderedFields(form);
  const index = fields.indexOf(current);
  const next = fields[index + (backwards ? -1 : 1)];
  if (next) {
    next.focus();
    return;
  }
  if (backwards) return;

  form.requestSubmit();
  window.setTimeout(() => focusFirstInvalidField(form), 0);
}

export function focusNextField(form: HTMLFormElement, current: Element | null) {
  const fields = orderedFields(form);
  const index = current ? fields.indexOf(current as HTMLElement) : -1;
  const next = fields[index + 1];
  if (next) {
    next.focus();
  } else {
    form.requestSubmit();
    window.setTimeout(() => focusFirstInvalidField(form), 0);
  }
}

export function focusPreviousField(form: HTMLFormElement, current: Element | null) {
  const fields = orderedFields(form);
  const index = current ? fields.indexOf(current as HTMLElement) : -1;
  if (index > 0) fields[index - 1]?.focus();
}

export function useEnterToNext(): KeyboardEventHandler<HTMLFormElement> {
  return useCallback((event) => {
    if (
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      event.nativeEvent.keyCode === 229 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.currentTarget.dataset.enterNav === "off"
    )
      return;

    const form = event.currentTarget;
    const target = event.target;
    if (!(target instanceof HTMLElement) || target instanceof HTMLTextAreaElement) return;
    if (target instanceof HTMLInputElement && target.type === "search") return;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement) &&
      target.getAttribute("role") !== "combobox"
    )
      return;
    if (!isNavigableField(target)) return;

    if (target instanceof HTMLSelectElement) {
      if (event.shiftKey) {
        event.preventDefault();
        moveToField(form, target, true);
        return;
      }
      if (!isPopupOpen(target)) {
        event.preventDefault();
        moveToField(form, target, false);
        return;
      }
      const cleanup = () => {
        target.removeEventListener("change", onChange);
        target.removeEventListener("blur", cleanup);
        window.clearTimeout(timeout);
      };
      const onChange = () => {
        cleanup();
        window.setTimeout(() => moveToField(form, target, false), 0);
      };
      let timeout = 0;
      target.addEventListener("change", onChange, { once: true });
      target.addEventListener("blur", cleanup, { once: true });
      timeout = window.setTimeout(cleanup, 30000);
      return;
    }

    if (!event.shiftKey && isPopupOpen(target)) return;
    event.preventDefault();
    moveToField(form, target, event.shiftKey);
  }, []);
}
