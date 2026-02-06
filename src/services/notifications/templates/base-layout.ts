/**
 * White-labelable base email layout.
 *
 * 600px max-width container with brand logo/color accent,
 * content slot, footer with unsubscribe + tracking pixel.
 *
 * Design principles:
 * - Brand color flows through header bar, accent elements, and CTA buttons
 * - Neutral container keeps content readable regardless of brand color
 * - Generous whitespace and refined typography for a premium feel
 * - Mobile responsive (single-column, stacked layout on small screens)
 */

export interface BrandingParams {
  brandName: string;
  brandColor: string;
  logoUrl?: string;
}

export interface BaseLayoutParams extends BrandingParams {
  content: string;
  preheader?: string;
  footerText?: string;
  trackingPixelUrl?: string;
  unsubscribeUrl?: string;
}

/**
 * Compute a slightly darker shade of a hex color for hover/gradient use.
 */
function darkenColor(hex: string, amount = 0.15): string {
  const clean = hex.replace("#", "");
  const r = Math.max(0, parseInt(clean.slice(0, 2), 16) * (1 - amount));
  const g = Math.max(0, parseInt(clean.slice(2, 4), 16) * (1 - amount));
  const b = Math.max(0, parseInt(clean.slice(4, 6), 16) * (1 - amount));
  return `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`;
}

/**
 * Compute a very light tint of a hex color for subtle background fills.
 */
function tintColor(hex: string, amount = 0.92): string {
  const clean = hex.replace("#", "");
  const r = Math.min(255, parseInt(clean.slice(0, 2), 16) + (255 - parseInt(clean.slice(0, 2), 16)) * amount);
  const g = Math.min(255, parseInt(clean.slice(2, 4), 16) + (255 - parseInt(clean.slice(2, 4), 16)) * amount);
  const b = Math.min(255, parseInt(clean.slice(4, 6), 16) + (255 - parseInt(clean.slice(4, 6), 16)) * amount);
  return `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`;
}

export { darkenColor, tintColor };

export function baseLayout(params: BaseLayoutParams): { html: string; text: string } {
  const {
    brandName,
    brandColor,
    logoUrl,
    content,
    preheader,
    footerText,
    trackingPixelUrl,
    unsubscribeUrl,
  } = params;

  const brandColorDark = darkenColor(brandColor, 0.12);
  const year = new Date().getFullYear();
  const footer = footerText || `\u00A9 ${year} ${brandName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${brandName}</title>
  <!--[if mso]>
  <noscript><xml>
    <o:OfficeDocumentSettings>
      <o:PixelsPerInch>96</o:PixelsPerInch>
    </o:OfficeDocumentSettings>
  </xml></noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .email-outer { padding: 8px !important; }
      .email-container { width: 100% !important; }
      .email-card { padding: 28px 20px !important; }
      .email-header { padding: 20px 20px 16px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f0f0f3; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#f0f0f3;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ""}

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f0f0f3;">
    <tr>
      <td class="email-outer" align="center" style="padding: 24px 16px;">
        <table role="presentation" class="email-container" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%;">

          <!-- Brand Header Bar -->
          <tr>
            <td class="email-header" style="background: linear-gradient(135deg, ${brandColor}, ${brandColorDark}); background-color: ${brandColor}; padding: 24px 32px 20px 32px; border-radius: 16px 16px 0 0; text-align: center;">
              ${logoUrl
                ? `<img src="${logoUrl}" alt="${brandName}" style="max-height: 36px; max-width: 200px; object-fit: contain;" />`
                : `<span style="font-size: 18px; font-weight: 700; color: #ffffff; letter-spacing: 0.02em;">${brandName}</span>`
              }
            </td>
          </tr>

          <!-- Content Card -->
          <tr>
            <td class="email-card" style="background-color: #ffffff; padding: 36px 32px 32px 32px; border-left: 1px solid #e4e4e7; border-right: 1px solid #e4e4e7;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; border-radius: 0 0 16px 16px; border: 1px solid #e4e4e7; border-top: none; padding: 20px 32px; text-align: center;">
              <p style="color: #a1a1aa; font-size: 12px; line-height: 18px; margin: 0;">
                ${footer}
              </p>
              ${unsubscribeUrl
                ? `<p style="margin: 6px 0 0 0;"><a href="${unsubscribeUrl}" style="color: #a1a1aa; font-size: 11px; text-decoration: underline;">Manage notification preferences</a></p>`
                : ""
              }
            </td>
          </tr>

        </table>

        ${trackingPixelUrl ? `<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;border:0;" alt="" />` : ""}
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = "";
  return { html, text };
}

/**
 * Wrap inner HTML content with the base layout.
 * Each template calls this with its rendered content.
 */
export function renderWithLayout(
  branding: BrandingParams,
  innerHtml: string,
  options?: {
    preheader?: string;
    trackingPixelUrl?: string;
    unsubscribeUrl?: string;
  }
): string {
  const result = baseLayout({
    ...branding,
    content: innerHtml,
    preheader: options?.preheader,
    trackingPixelUrl: options?.trackingPixelUrl,
    unsubscribeUrl: options?.unsubscribeUrl,
  });
  return result.html;
}
