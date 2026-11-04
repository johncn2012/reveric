// Phosphor icon — fetches the SVG once and inlines it. Phosphor SVGs use
// `currentColor` on the stroke, so colors just work through normal CSS.
const __ICON_CACHE = new Map();   // name -> Promise<string>
function loadIconSvg(name) {
  if (!__ICON_CACHE.has(name)) {
    __ICON_CACHE.set(
      name,
      fetch(`assets/icons/phosphor/${name}.svg`).then((r) => r.text())
    );
  }
  return __ICON_CACHE.get(name);
}

function Icon({ name, size = 16, color, style, className }) {
  const px = typeof size === "number" ? `${size}px` : size;
  const [svg, setSvg] = React.useState("");
  React.useEffect(() => {
    let active = true;
    loadIconSvg(name).then((s) => {
      if (!active) return;
      // Force the SVG to fill the span and inherit currentColor.
      const sized = s
        .replace(/<svg([^>]*?)width="[^"]*"/, "<svg$1")
        .replace(/<svg([^>]*?)height="[^"]*"/, "<svg$1")
        .replace(
          /<svg/,
          '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet"'
        );
      setSvg(sized);
    });
    return () => {
      active = false;
    };
  }, [name]);

  return (
    <span
      className={"m-icon " + (className || "")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        width: px,
        height: px,
        color: color || "currentColor",
        verticalAlign: "middle",
        lineHeight: 0,
        ...style,
      }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// MetaArc 元弧 L1 双弧。内联绘制，标题栏任意尺寸都不依赖网络。
function Mark({ size = 18, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden="true"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="5.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(0,2)"
      >
        <path d="M11 49 C13 26 21 13 32 13 C43 13 51 26 53 49" />
        <path d="M19.5 49 C21 35 26.5 25 32 25 C37.5 25 43 35 44.5 49" />
      </g>
    </svg>
  );
}

Object.assign(window, { Icon, Mark });
