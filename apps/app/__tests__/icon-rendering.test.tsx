import { Icon } from "@delulu/design-system/providers/icon";
import { Calendar01Icon } from "@delulu/icons";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("icon rendering", () => {
  it("preserves solid icon cutouts without adding a stroke", () => {
    const { container } = render(
      <Icon
        icon={[
          [
            "path",
            {
              key: "body",
              fill: "currentColor",
              fillRule: "evenodd",
              d: "M0 0H24V24H0ZM8 8V16H16V8Z",
            },
          ],
        ]}
      />
    );
    expect(container.querySelector("svg")?.getAttribute("stroke")).toBeNull();
    expect(container.querySelector("path")?.getAttribute("stroke")).toBeNull();
    expect(container.querySelector("path")?.getAttribute("fill-rule")).toBe(
      "evenodd"
    );
  });
  it("preserves each outline path's native stroke width", () => {
    const { container } = render(<Icon icon={Calendar01Icon} />);
    const paths = container.querySelectorAll("path");
    for (const [index, [, attrs]] of Calendar01Icon.entries()) {
      expect(paths[index].getAttribute("stroke-width")).toBe(
        String(attrs.strokeWidth)
      );
    }
  });
});
