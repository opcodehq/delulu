import { LOGOS, type LogoName } from "../logos";
import { escapeHtml } from "../markup";

const isLogoName = (ref: string): ref is LogoName => Object.hasOwn(LOGOS, ref);

/** A brand mark: a built-in logo name (inlined, takes `currentColor`) or an image path. */
export const logo = (ref: string, cls = ""): string =>
  isLogoName(ref)
    ? `<span class="dv-logo dv-logo-${ref} ${cls}">${LOGOS[ref]}</span>`
    : `<span class="dv-logo ${cls}"><img src="${escapeHtml(ref)}" alt=""></span>`;

/** The title bar of an app window: traffic lights, an optional logo and a title. */
export const windowBar = (title: string, logoRef?: string): string =>
  `<div class="dv-winbar"><span class="dv-lights"><i></i><i></i><i></i></span><span class="dv-wintitle">${
    logoRef ? logo(logoRef, "dv-winlogo") : ""
  }${escapeHtml(title)}</span></div>`;
