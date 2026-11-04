import { fireEvent, screen, within } from "@testing-library/react";

export async function chooseSelectOption(
  trigger: HTMLElement,
  optionName: string | RegExp,
) {
  fireEvent.click(trigger);
  const popup = await screen.findByRole("listbox");
  const option = within(popup).getByRole("option", { name: optionName });
  // Base UI ignores a click that did not start with pointerdown on the item.
  fireEvent.pointerDown(option, { pointerType: "mouse", button: 0, isPrimary: true });
  fireEvent.click(option);
}

export async function useTypedFontFamily(trigger: HTMLElement, family: string) {
  fireEvent.click(trigger);
  const input = await screen.findByPlaceholderText(/搜索字体|Search fonts/);
  fireEvent.change(input, { target: { value: family } });
  const pattern = new RegExp(family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  fireEvent.click(await screen.findByRole("button", { name: pattern }));
}
