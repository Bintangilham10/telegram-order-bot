import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./lib/api";
import LoginPage from "./components/LoginPage";

function formatIdr(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

const emptyProduct = {
  name: "",
  description: "",
  price: 1000,
  category: "Umum",
  is_unlimited_stock: false,
  digital_file_pointer: "",
  delivery_note: "",
  terms_url: "",
};

const STOCK_DELIMITER_TEMPLATES = [
  {
    key: "email-pass",
    label: "email|pass",
    value: "user@mail.com|password123",
  },
  {
    key: "email-pass-2fa",
    label: "email|pass|2fa",
    value: "user@mail.com|password123|ABCD-EFGH-IJKL",
  },
  {
    key: "email-pass-link-mail",
    label: "email|pass|link akses mail",
    value: "user@mail.com|password123|https://mail.google.com",
  },
  {
    key: "email-pass-2fa-link-mail",
    label: "email|pass|2fa|link akses mail",
    value: "user@mail.com|password123|ABCD-EFGH-IJKL|https://mail.google.com",
  },
  {
    key: "email-link-mail",
    label: "email|link akses mail",
    value: "user@mail.com|https://mail.google.com",
  },
  {
    key: "username-pass-link-mail",
    label: "username|pass|link akses mail",
    value: "username123|password123|https://mail.google.com",
  },
  {
    key: "username-pass-mail-link",
    label: "username|pass|mail|link akses",
    value: "username123|password123|mail|https://mail.google.com",
  },
  {
    key: "username-pass-2fa-link",
    label: "username|pass|2fa|link akses",
    value: "username123|password123|ABCD-EFGH-IJKL|https://mail.google.com",
  },
  {
    key: "download-link",
    label: "link download (source code)",
    value: "https://example.com/download/source-code.zip",
  },
];

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "products", label: "Products" },
  { key: "stock", label: "Stock" },
  { key: "orders", label: "Orders" },
  { key: "payments", label: "Top Up Reviews" },
  { key: "users", label: "Users" },
  { key: "reports", label: "Reports" },
  { key: "wallets", label: "Wallets" },
  { key: "broadcast", label: "Broadcast" },
  { key: "reviews", label: "Reviews" },
  { key: "tickets", label: "Tickets" },
  { key: "settings", label: "Settings" },
];

function isWalletTopup(order) {
  return (
    Number(order?.product_id) === 0 && order?.product_name === "Wallet Top Up"
  );
}

function Icon({ type }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (type) {
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      );
    case "dashboard":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="8" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="15" width="7" height="6" />
        </svg>
      );
    case "products":
      return (
        <svg {...common}>
          <path d="M20 7l-8 4-8-4" />
          <path d="M4 7l8-4 8 4" />
          <path d="M4 7v10l8 4 8-4V7" />
        </svg>
      );
    case "stock":
      return (
        <svg {...common}>
          <path d="M3 7h18" />
          <path d="M6 7V5h12v2" />
          <path d="M6 7v12" />
          <path d="M18 7v12" />
          <path d="M6 19h12" />
        </svg>
      );
    case "orders":
      return (
        <svg {...common}>
          <path d="M6 2h12" />
          <path d="M9 2v4" />
          <path d="M15 2v4" />
          <rect x="4" y="6" width="16" height="16" rx="2" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
      );
    case "payments":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 10h18" />
          <path d="M7 15h3" />
          <path d="M15 14l2 2 4-4" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M4 19V5" />
          <path d="M10 19V9" />
          <path d="M16 19V13" />
          <path d="M22 19V3" />
        </svg>
      );
    case "broadcast":
      return (
        <svg {...common}>
          <path d="M3 11V9a2 2 0 0 1 2-2h3l8-3v16l-8-3H5a2 2 0 0 1-2-2v-2" />
          <path d="M7 17l1 4" />
          <path d="M20 9v6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1A1.7 1.7 0 0 0 10 3.2V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h.1a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      );
    case "copy":
      return (
        <svg {...common}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12l5 5 9-11" />
        </svg>
      );
    case "save":
      return (
        <svg {...common}>
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
      );
    case "link":
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
        </svg>
      );
    case "wallet":
    case "wallets":
      return (
        <svg {...common}>
          <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
          <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
          <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 2L4 5v6c0 5 4 9 8 11 4-2 8-6 8-11V5z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      );
    case "tag":
      return (
        <svg {...common}>
          <path d="M20 12L12 20l-9-9V3h8z" />
          <circle cx="7.5" cy="7.5" r="1.5" />
        </svg>
      );
    case "box":
      return (
        <svg {...common}>
          <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.3 7 12 12 20.7 7" />
          <line x1="12" y1="22" x2="12" y2="12" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="M22 2L11 13" />
          <path d="M22 2l-7 20-4-9-9-4z" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      );
    case "arrow-up":
      return (
        <svg {...common}>
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      );
    case "arrow-down":
      return (
        <svg {...common}>
          <path d="M12 5v14" />
          <path d="M19 12l-7 7-7-7" />
        </svg>
      );
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      );
    case "eye":
      return (
        <svg {...common}>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" />
          <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />
        </svg>
      );
    case "zap":
      return (
        <svg {...common}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "message":
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "phone":
      return (
        <svg {...common}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13 1 .37 1.97.72 2.9a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.18-1.18a2 2 0 0 1 2.11-.45c.93.35 1.9.59 2.9.72A2 2 0 0 1 22 16.92z" />
        </svg>
      );
    case "reviews":
      return (
        <svg {...common}>
          <path d="M12 2l3.1 6.3L22 9.3l-5 4.9 1.2 6.8L12 17.8l-6.2 3.2L7 14.2l-5-4.9 6.9-1L12 2z" />
        </svg>
      );
    case "tickets":
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-");
  return `${month}/${year}`;
}

function paginateArray(list, page, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil((list?.length || 0) / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    totalPages,
    items: (list || []).slice(start, start + pageSize),
  };
}

function Pager({ page, totalPages, onPrev, onNext }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pager-row">
      <button className="ghost" onClick={onPrev} disabled={page <= 1}>
        Previous
      </button>
      <span>
        Page {page} / {totalPages}
      </span>
      <button className="ghost" onClick={onNext} disabled={page >= totalPages}>
        Next
      </button>
    </div>
  );
}

function abbreviateIdr(value) {
  const num = Number(value || 0);
  if (num >= 1_000_000_000)
    return `${(num / 1_000_000_000).toFixed(num >= 10_000_000_000 ? 0 : 1)}M`;
  if (num >= 1_000_000)
    return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1)}jt`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}k`;
  return String(num);
}

function formatRelativeTime(isoOrText) {
  if (!isoOrText) return "-";
  const t = new Date(isoOrText).getTime();
  if (!Number.isFinite(t)) return String(isoOrText);
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "baru saja";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} hari lalu`;
  return new Date(t).toISOString().slice(0, 10);
}

// Mini sparkline tanpa axis untuk dashboard KPI card.
function Sparkline({
  data = [],
  color = "#2b7dff",
  accent = "#14bca0",
  width = 180,
  height = 56,
}) {
  if (!data.length) return null;

  const max = Math.max(
    ...data.map((d) => Number(d.revenue || d.value || 0)),
    1,
  );
  const min = 0;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const pts = data.map((d, i) => {
    const v = Number(d.revenue || d.value || 0);
    const x = i * stepX;
    const range = max - min || 1;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return { x, y, v };
  });

  const linePath = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)} ${height} L${pts[0].x.toFixed(1)} ${height} Z`;
  const gradId = `spark-area-${color.replace("#", "")}-${accent.replace("#", "")}`;
  const lineId = `spark-line-${color.replace("#", "")}-${accent.replace("#", "")}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="spark-svg"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={lineId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={color} />
          <stop offset="100%" stopColor={accent} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={`url(#${lineId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// SVG line + area chart untuk revenue trend.
// Kalau cuma 1 datapoint atau semua 0, tampilkan empty state.
function RevenueChart({ series, mode }) {
  const [hover, setHover] = useState(null);

  const width = 760;
  const height = 240;
  const padding = { top: 24, right: 24, bottom: 36, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const totalRevenue = series.reduce((sum, s) => sum + s.revenue, 0);
  if (!series.length || totalRevenue === 0) {
    return (
      <p className="hint hint-empty">
        Belum ada transaksi paid pada periode ini.
      </p>
    );
  }

  const maxValue = Math.max(...series.map((s) => s.revenue));
  const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;

  const points = series.map((s, i) => {
    const x = padding.left + i * stepX;
    const y =
      padding.top + innerH - (maxValue ? (s.revenue / maxValue) * innerH : 0);
    return { ...s, x, y };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)} ${(padding.top + innerH).toFixed(1)} L${points[0].x.toFixed(1)} ${(padding.top + innerH).toFixed(1)} Z`;

  const yTicks = 4;
  const tickValues = Array.from(
    { length: yTicks + 1 },
    (_, i) => (maxValue * (yTicks - i)) / yTicks,
  );

  // Pilih beberapa label X agar tidak crowd kalau datapoint banyak.
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  function handleMove(e) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const x = ratioX * width;
    let nearest = points[0];
    let bestDist = Infinity;
    for (const p of points) {
      const d = Math.abs(p.x - x);
      if (d < bestDist) {
        bestDist = d;
        nearest = p;
      }
    }
    setHover(nearest);
  }

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="chart-svg"
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Revenue trend chart"
      >
        <defs>
          <linearGradient id="chart-area-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#14bca0" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="chart-line-gradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#2b7dff" />
            <stop offset="100%" stopColor="#14bca0" />
          </linearGradient>
        </defs>

        {/* Y grid + label */}
        {tickValues.map((v, i) => {
          const y = padding.top + (innerH * i) / yTicks;
          return (
            <g key={`y-${i}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e7edf8"
                strokeDasharray={i === yTicks ? "0" : "3 3"}
              />
              <text x={padding.left - 8} y={y + 4} className="chart-y-label">
                {v ? `Rp ${abbreviateIdr(v)}` : "0"}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#chart-area-gradient)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="url(#chart-line-gradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Datapoints */}
        {points.map((p) => (
          <circle
            key={`pt-${p.key}`}
            cx={p.x}
            cy={p.y}
            r={hover?.key === p.key ? 6 : 3}
            fill={hover?.key === p.key ? "#1c6dff" : "#ffffff"}
            stroke="#1c6dff"
            strokeWidth="2"
          />
        ))}

        {/* X labels */}
        {points.map((p, i) => {
          if (i % labelEvery !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={`x-${p.key}`}
              x={p.x}
              y={height - padding.bottom + 18}
              className="chart-x-label"
              textAnchor="middle"
            >
              {mode === "daily" ? p.label : p.label}
            </text>
          );
        })}

        {/* Hover guide line */}
        {hover ? (
          <line
            x1={hover.x}
            x2={hover.x}
            y1={padding.top}
            y2={padding.top + innerH}
            stroke="#1c6dff"
            strokeOpacity="0.18"
            strokeDasharray="3 3"
          />
        ) : null}
      </svg>

      {hover ? (
        <div
          className="chart-tooltip"
          style={{
            left: `${(hover.x / width) * 100}%`,
            top: `${((hover.y - 8) / height) * 100}%`,
          }}
        >
          <strong>{hover.label}</strong>
          <span>Rp {Number(hover.revenue || 0).toLocaleString("id-ID")}</span>
          <span className="chart-tooltip-sub">
            {hover.orders} order{hover.orders === 1 ? "" : "s"}
          </span>
        </div>
      ) : null}
    </div>
  );
}

const STATUS_COLORS = {
  pending: "#f5a524",
  pending_payment: "#f5a524",
  waiting_confirmation: "#8b5cf6",
  payment_rejected: "#ef4444",
  delivery_pending: "#0ea5e9",
  delivering: "#2563eb",
  paid: "#10b981",
  delivered: "#22c55e",
  expired: "#94a3b8",
  failed: "#ef4444",
  cancelled: "#cbd5e1",
};

// Donut chart SVG untuk distribusi status order.
function StatusDonut({ statusCount }) {
  const entries = Object.entries(statusCount).filter(([, c]) => c > 0);
  const total = entries.reduce((sum, [, c]) => sum + c, 0);

  if (total === 0) {
    return <p className="hint hint-empty">Belum ada order pada periode ini.</p>;
  }

  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;
  const stroke = 22;

  let cumulative = 0;
  const segments = entries.map(([status, count]) => {
    const start = cumulative / total;
    cumulative += count;
    const end = cumulative / total;
    const startAngle = start * 2 * Math.PI - Math.PI / 2;
    const endAngle = end * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const large = end - start > 0.5 ? 1 : 0;
    const d = `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
    return {
      status,
      count,
      d,
      color: STATUS_COLORS[status] || "#64748b",
      percent: ((count / total) * 100).toFixed(1),
    };
  });

  const dominant = entries.sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="donut-wrap">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="donut-svg"
        role="img"
        aria-label="Order status distribution"
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="#eef2fb"
          strokeWidth={stroke}
        />
        {segments.map((s) => (
          <path
            key={s.status}
            d={s.d}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeLinecap="butt"
          >
            <title>{`${s.status}: ${s.count} (${s.percent}%)`}</title>
          </path>
        ))}
        <text
          x={cx}
          y={cy - 4}
          className="donut-center-num"
          textAnchor="middle"
        >
          {total}
        </text>
        <text
          x={cx}
          y={cy + 14}
          className="donut-center-label"
          textAnchor="middle"
        >
          orders
        </text>
      </svg>

      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.status}>
            <span className="donut-dot" style={{ backgroundColor: s.color }} />
            <span className="donut-status">{s.status}</span>
            <strong>{s.count}</strong>
            <span className="donut-percent">{s.percent}%</span>
          </li>
        ))}
      </ul>

      <p className="hint donut-hint">
        Status dominan: <strong>{dominant[0]}</strong> (
        {((dominant[1] / total) * 100).toFixed(1)}%).
      </p>
    </div>
  );
}

export default function App() {
  const liveSyncRef = useRef(false);
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [collapsedSidebar, setCollapsedSidebar] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [manualPayments, setManualPayments] = useState([]);
  const [paymentActionMessage, setPaymentActionMessage] = useState("");
  const [uploadingQris, setUploadingQris] = useState(false);
  const [qrisImageVersion, setQrisImageVersion] = useState(Date.now());
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [stockData, setStockData] = useState(null);
  const [stockInput, setStockInput] = useState("");
  const [selectedStockTemplate, setSelectedStockTemplate] = useState(
    STOCK_DELIMITER_TEMPLATES[0].value,
  );
  const [uploadingDigitalFile, setUploadingDigitalFile] = useState(false);
  const [productsPage, setProductsPage] = useState(1);
  const [stockPage, setStockPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [reportPeriod, setReportPeriod] = useState("30d");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [notifyModal, setNotifyModal] = useState(null);
  const [notifyForm, setNotifyForm] = useState({
    message: "",
    includeNewDownload: true,
  });
  const [notifyResult, setNotifyResult] = useState(null);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const [broadcastForm, setBroadcastForm] = useState({
    message: "",
    buttonText: "",
    buttonUrl: "",
  });
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [broadcastJob, setBroadcastJob] = useState(null);
  const [webhookInfo, setWebhookInfo] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewsPage, setReviewsPage] = useState(1);
  const [tickets, setTickets] = useState([]);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketDetail, setTicketDetail] = useState(null);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketFilter, setTicketFilter] = useState("all");

  // Wallet management
  const [wallets, setWallets] = useState([]);
  const [walletsPage, setWalletsPage] = useState(1);
  const [walletSearch, setWalletSearch] = useState("");
  const [adjustModal, setAdjustModal] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ amount: "", description: "" });
  const [adjustMsg, setAdjustMsg] = useState("");
  // User detail modal
  const [userDetailModal, setUserDetailModal] = useState(null);
  // Maintenance & backup
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [backups, setBackups] = useState([]);

  const [generalSettings, setGeneralSettings] = useState({
    enabled: true,
    methodName: "GoPay Merchant QR",
    accountName: "Ciganstore",
    instructions:
      "Bayar nominal top up melalui GoPay lalu kirim bukti pembayaran.",
    adminTelegramId: "",
    checkoutExpiryMinutes: 60,
  });

  const [brandingForm, setBrandingForm] = useState({
    name: "",
    shortName: "INV",
    tagline: "",
    broadcastTitle: "Pengumuman Resmi",
    supportTelegramUrl: "",
    supportWhatsappUrl: "",
  });

  async function afterLoginLoad() {
    const [boot, prod, ord, usr, payments] = await Promise.all([
      api.bootstrap(),
      api.products(),
      api.orders(200),
      api.users(1000),
      api.manualPayments(200),
    ]);
    setBootstrap(boot);
    setProducts(prod);
    setOrders(ord);
    setUsers(usr);
    setManualPayments(payments);
    const walletTopup = boot.walletTopup || boot.manualPayment || {};
    setGeneralSettings({
      enabled: walletTopup.enabled !== false,
      methodName: walletTopup.methodName || "GoPay Merchant QR",
      accountName: walletTopup.accountName || "Ciganstore",
      instructions:
        walletTopup.instructions ||
        "Bayar nominal top up melalui GoPay lalu kirim bukti pembayaran.",
      adminTelegramId: boot.adminTelegramId || "",
      checkoutExpiryMinutes: Number(boot.checkoutExpiryMinutes || 60),
    });
    setBrandingForm({
      name: boot.brand?.name || "",
      shortName: boot.brand?.shortName || "INV",
      tagline: boot.brand?.tagline || "",
      broadcastTitle: boot.brand?.broadcastTitle || "Pengumuman Resmi",
      supportTelegramUrl: boot.brand?.supportTelegramUrl || "",
      supportWhatsappUrl: boot.brand?.supportWhatsappUrl || "",
    });
    if (prod.length && !selectedProductId) setSelectedProductId(prod[0].id);
  }

  useEffect(() => {
    let mounted = true;

    async function checkExistingSession() {
      try {
        await afterLoginLoad();
        if (mounted) {
          setAuthed(true);
        }
      } catch {
        if (mounted) {
          setAuthed(false);
        }
      } finally {
        if (mounted) {
          setCheckingAuth(false);
        }
      }
    }

    checkExistingSession();

    return () => {
      mounted = false;
    };
  }, []);

  async function loadReviews() {
    setLoading(true);
    try {
      setReviews(await api.reviews());
    } catch {}
    setLoading(false);
  }

  async function toggleReview(id, visible) {
    try {
      await api.toggleReview(id, visible);
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, visible } : r)),
      );
    } catch {}
  }

  async function loadTickets() {
    setLoading(true);
    try {
      const filter = ticketFilter === "all" ? undefined : ticketFilter;
      setTickets(await api.tickets(filter));
    } catch {}
    setLoading(false);
  }

  async function loadTicketDetail(id) {
    try {
      const detail = await api.ticket(id);
      setTicketDetail(detail);
      setSelectedTicket(id);
    } catch {}
  }

  async function sendTicketReply() {
    if (!ticketReply.trim() || !selectedTicket) return;
    setLoading(true);
    try {
      await api.replyTicket(selectedTicket, ticketReply);
      setTicketReply("");
      await loadTicketDetail(selectedTicket);
    } catch {}
    setLoading(false);
  }

  async function closeTicket(id) {
    try {
      await api.closeTicket(id);
      await loadTickets();
      if (selectedTicket === id) {
        setSelectedTicket(null);
        setTicketDetail(null);
      }
    } catch {}
  }

  // Wallet management
  async function loadWallets() {
    setLoading(true);
    try {
      setWallets(await api.wallets());
    } catch {}
    setLoading(false);
  }

  async function submitAdjust(e) {
    e.preventDefault();
    if (!adjustModal) return;
    setAdjustMsg("");
    try {
      const result = await api.adjustWallet(
        adjustModal.user_id,
        Number(adjustForm.amount),
        adjustForm.description,
      );
      setAdjustMsg(
        `✅ Saldo diubah. Balance baru: Rp ${formatIdr(result.newBalance)}`,
      );
      loadWallets();
      setAdjustForm({ amount: "", description: "" });
    } catch (err) {
      setAdjustMsg(`❌ ${err.message}`);
    }
  }

  async function loadUserDetail(userId) {
    try {
      const detail = await api.userDetail(userId);
      setUserDetailModal(detail);
    } catch {}
  }

  async function toggleBlockUser(userId, blocked) {
    try {
      await api.blockUser(userId, blocked);
      const updated = users.map((u) =>
        u.user_id === userId ? { ...u, is_blocked: blocked ? 1 : 0 } : u,
      );
      setUsers(updated);
    } catch {}
  }

  // Maintenance & backup
  async function loadMaintenanceStatus() {
    try {
      const r = await api.getMaintenanceStatus();
      setMaintenanceEnabled(r.enabled);
    } catch {}
  }

  async function toggleMaintenance() {
    try {
      const r = await api.setMaintenance(!maintenanceEnabled);
      setMaintenanceEnabled(r.enabled);
    } catch {}
  }

  async function loadBackups() {
    try {
      setBackups(await api.listBackups());
    } catch {}
  }

  async function triggerBackup() {
    try {
      await api.triggerBackup();
      setTimeout(loadBackups, 2000);
    } catch {}
  }

  useEffect(() => {
    if (tab === "reviews" && authed && !reviews.length) loadReviews();
    if (tab === "tickets" && authed) loadTickets();
    if (tab === "wallets" && authed) loadWallets();
    if (tab === "settings" && authed) {
      loadMaintenanceStatus();
      loadBackups();
    }
  }, [tab, ticketFilter]);

  async function onLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(password);
      setAuthed(true);
      await afterLoginLoad();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function reloadAll() {
    setLoading(true);
    try {
      await afterLoginLoad();
      if (selectedProductId) {
        const stock = await api.stock(selectedProductId);
        setStockData(stock);
      }
    } finally {
      setLoading(false);
    }
  }

  async function syncLiveData() {
    if (!authed || liveSyncRef.current) return;
    liveSyncRef.current = true;
    try {
      const [boot, prod, ord, usr, payments, stock] = await Promise.all([
        api.bootstrap(),
        api.products(),
        api.orders(200),
        api.users(1000),
        api.manualPayments(200),
        selectedProductId
          ? api.stock(selectedProductId)
          : Promise.resolve(null),
      ]);

      setBootstrap(boot);
      setProducts(prod);
      setOrders(ord);
      setUsers(usr);
      setManualPayments(payments);

      if (!selectedProductId && prod.length) {
        setSelectedProductId(prod[0].id);
      }

      if (stock) {
        setStockData(stock);
      }
    } catch {
      // Keep background sync quiet to avoid interrupting active admin flows.
    } finally {
      liveSyncRef.current = false;
    }
  }

  async function saveGeneralSettings(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.updateGeneralSettings(generalSettings);
      await reloadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadQrisImage(file) {
    if (!file) return;
    setUploadingQris(true);
    setError("");
    try {
      await api.uploadQrisImage(file);
      setQrisImageVersion(Date.now());
      await reloadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingQris(false);
    }
  }

  async function runPaymentAction(action, order) {
    const walletTopup = isWalletTopup(order);
    let reason = "";
    let note = "";
    if (action === "approve") {
      note =
        prompt(
          walletTopup
            ? "Catatan persetujuan top up (opsional):"
            : "Catatan admin (opsional):",
          order.admin_note || "",
        ) ?? "";
    } else if (action === "reject") {
      reason =
        prompt(
          "Alasan penolakan yang akan dikirim ke pembeli:",
          order.payment_rejection_reason || "",
        ) ?? "";
      if (!reason.trim()) return;
      note =
        prompt("Catatan internal admin (opsional):", order.admin_note || "") ??
        "";
    } else if (action === "request-proof") {
      reason =
        prompt(
          "Jelaskan bukti apa yang perlu dikirim ulang:",
          order.payment_rejection_reason || "",
        ) ?? "";
      if (!reason.trim()) return;
      note =
        prompt("Catatan internal admin (opsional):", order.admin_note || "") ??
        "";
    }

    setLoading(true);
    setError("");
    setPaymentActionMessage("");
    try {
      let result;
      if (action === "approve")
        result = await api.approvePayment(order.id, note);
      if (action === "reject")
        result = await api.rejectPayment(order.id, reason, note);
      if (action === "request-proof")
        result = await api.requestNewProof(order.id, reason, note);
      if (action === "retry") result = await api.retryDelivery(order.id);
      setPaymentActionMessage(
        walletTopup && action === "approve"
          ? `Top up #${order.id} disetujui. Saldo pengguna sudah ditambahkan.`
          : `Order #${order.id}: status ${result?.status || "diperbarui"}.`,
      );
      await reloadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveBranding(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.updateBranding(brandingForm);
      await reloadAll();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function refreshWebhookStatus() {
    setLoading(true);
    setError("");
    try {
      const status = await api.telegramWebhookStatus();
      setWebhookInfo(status);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function setupWebhook() {
    setLoading(true);
    setError("");
    try {
      await api.telegramWebhookSetup();
      await refreshWebhookStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteWebhook() {
    if (!confirm("Hapus webhook Telegram saat ini?")) return;
    setLoading(true);
    setError("");
    try {
      await api.telegramWebhookDelete();
      await refreshWebhookStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function resetProductForm() {
    setProductForm(emptyProduct);
    setEditingProductId(null);
  }

  function startEditProduct(product) {
    setProductForm({
      name: product.name || "",
      description: product.description || "",
      price: Number(product.price || 1000),
      category: product.category || "Umum",
      is_unlimited_stock: Number(product.is_unlimited_stock) === 1,
      digital_file_pointer: product.digital_file_pointer || "",
      delivery_note: product.delivery_note || "",
      terms_url: product.terms_url || "",
    });
    setEditingProductId(product.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitProduct(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        ...productForm,
        price: Number(productForm.price),
        is_unlimited_stock: !!productForm.is_unlimited_stock,
        digital_file_pointer: productForm.is_unlimited_stock
          ? (productForm.digital_file_pointer || "").trim()
          : "",
        delivery_note: (productForm.delivery_note || "").trim(),
        terms_url: (productForm.terms_url || "").trim(),
      };
      if (payload.is_unlimited_stock && !payload.digital_file_pointer) {
        throw new Error(
          "Upload file digital terlebih dahulu sebelum simpan produk unlimited.",
        );
      }
      if (editingProductId) {
        await api.updateProduct(editingProductId, payload);
      } else {
        await api.createProduct(payload);
      }
      resetProductForm();
      await reloadAll();
      setTab("products");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadProductDigitalFile(file) {
    if (!file) return;
    setUploadingDigitalFile(true);
    setError("");
    try {
      const uploaded = await api.uploadDigitalFile(file);
      // stockValue = "file:downloads/..."; pointer ini disimpan di kolom digital_file_pointer produk.
      setProductForm((prev) => ({
        ...prev,
        digital_file_pointer: uploaded.stockValue,
        is_unlimited_stock: true,
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingDigitalFile(false);
    }
  }

  async function removeProduct(id) {
    if (!confirm(`Hapus produk #${id}?`)) return;
    setLoading(true);
    try {
      await api.deleteProduct(id);
      await reloadAll();
    } finally {
      setLoading(false);
    }
  }

  async function openNotifyModal(product) {
    setLoading(true);
    setError("");
    setNotifyResult(null);
    try {
      const info = await api.productBuyers(product.id);
      setNotifyModal({ product, info });
      setNotifyForm({
        message: `Halo! "${product.name}" sudah saya update ke versi terbaru. Silakan pakai link download baru di bawah.`,
        includeNewDownload: true,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function closeNotifyModal() {
    setNotifyModal(null);
    setNotifyResult(null);
  }

  async function submitNotifyUpdate(e) {
    e.preventDefault();
    if (!notifyModal) return;
    setLoading(true);
    setError("");
    try {
      const result = await api.notifyProductUpdate(notifyModal.product.id, {
        message: notifyForm.message,
        includeNewDownload: notifyForm.includeNewDownload,
      });
      setNotifyResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadStock(productId) {
    setSelectedProductId(productId);
    setLoading(true);
    try {
      const data = await api.stock(productId);
      setStockData(data);
      setTab("stock");
    } finally {
      setLoading(false);
    }
  }

  async function addStock(e) {
    e.preventDefault();
    if (!selectedProductId) return;
    const items = stockInput
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (!items.length) return;

    setLoading(true);
    try {
      await api.addStock(selectedProductId, items);
      setStockInput("");
      await loadStock(selectedProductId);
      await reloadAll();
    } finally {
      setLoading(false);
    }
  }

  async function deleteStock(stockId) {
    if (!confirm("Hapus item stok ini?")) return;
    setLoading(true);
    try {
      await api.deleteStock(stockId);
      await loadStock(selectedProductId);
      await reloadAll();
    } finally {
      setLoading(false);
    }
  }

  function insertStockTemplate() {
    if (!selectedStockTemplate) return;
    setStockInput((prev) => {
      const next = prev.trim();
      return next ? `${next}\n${selectedStockTemplate}` : selectedStockTemplate;
    });
  }

  async function uploadDigitalFile(file) {
    if (!file) return;
    setUploadingDigitalFile(true);
    setError("");
    try {
      const uploaded = await api.uploadDigitalFile(file);
      setStockInput((prev) => {
        const next = prev.trim();
        return next ? `${next}\n${uploaded.stockValue}` : uploaded.stockValue;
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingDigitalFile(false);
    }
  }

  async function logout() {
    setLoading(true);
    try {
      await api.logout();
      setAuthed(false);
      setBootstrap(null);
      setProducts([]);
      setOrders([]);
      setManualPayments([]);
      setUsers([]);
      setStockData(null);
    } finally {
      setLoading(false);
    }
  }

  async function sendBroadcast(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setBroadcastResult(null);
    setBroadcastJob(null);

    try {
      const result = await api.broadcast({
        message: broadcastForm.message,
        buttonText: broadcastForm.buttonText,
        buttonUrl: broadcastForm.buttonUrl,
      });
      setBroadcastResult(result);

      // Polling progress: broadcast jalan di background, update status tiap 3 detik sampai selesai.
      if (result?.jobId) {
        let cancelled = false;

        const poll = async () => {
          if (cancelled) return;
          try {
            const job = await api.broadcastJob(result.jobId);
            setBroadcastJob(job);
            if (job?.status === "done" || job?.status === "failed") return;
          } catch {
            // Tetap polling, gangguan jaringan sementara aman diabaikan.
          }
          setTimeout(poll, 3000);
        };

        poll();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => b.id - a.id),
    [orders],
  );

  const orderStatusCounts = useMemo(() => {
    const counts = { all: orders.length, paid: 0, pending: 0, failed: 0 };
    for (const o of orders) {
      if (
        ["paid", "delivery_pending", "delivering", "delivered"].includes(
          o.status,
        )
      )
        counts.paid += 1;
      else if (
        [
          "pending",
          "pending_payment",
          "waiting_confirmation",
          "payment_rejected",
        ].includes(o.status)
      )
        counts.pending += 1;
      else if (
        o.status === "failed" ||
        o.status === "expired" ||
        o.status === "cancelled"
      )
        counts.failed += 1;
    }
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    return sortedOrders.filter((o) => {
      // Filter status grup.
      if (
        orderStatusFilter === "paid" &&
        !["paid", "delivery_pending", "delivering", "delivered"].includes(
          o.status,
        )
      )
        return false;
      if (
        orderStatusFilter === "pending" &&
        ![
          "pending",
          "pending_payment",
          "waiting_confirmation",
          "payment_rejected",
        ].includes(o.status)
      )
        return false;
      if (
        orderStatusFilter === "failed" &&
        !(
          o.status === "failed" ||
          o.status === "expired" ||
          o.status === "cancelled"
        )
      )
        return false;

      if (!q) return true;
      const hay = [
        String(o.id),
        o.product_name,
        o.first_name,
        o.username,
        String(o.user_id || ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sortedOrders, orderStatusFilter, orderSearch]);
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = [u.first_name, u.username, String(u.user_id)]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, userSearch]);

  const reportSummary = useMemo(() => {
    const paidStatuses = new Set([
      "paid",
      "delivery_pending",
      "delivering",
      "delivered",
    ]);
    const now = new Date();
    const periodDays =
      reportPeriod === "7d"
        ? 7
        : reportPeriod === "30d"
          ? 30
          : reportPeriod === "90d"
            ? 90
            : null;
    const periodStart = periodDays
      ? new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000)
      : null;
    const previousStart = periodDays
      ? new Date(now.getTime() - periodDays * 2 * 24 * 60 * 60 * 1000)
      : null;

    const inPeriod = (order) => {
      if (!periodStart) return true;
      const t = new Date(order.created_at || 0).getTime();
      return t >= periodStart.getTime();
    };
    const inPrevPeriod = (order) => {
      if (!previousStart || !periodStart) return false;
      const t = new Date(order.created_at || 0).getTime();
      return t >= previousStart.getTime() && t < periodStart.getTime();
    };

    const productOrders = orders.filter((order) => !isWalletTopup(order));
    const periodOrders = productOrders.filter(inPeriod);
    const previousOrders = productOrders.filter(inPrevPeriod);

    const paidOrders = periodOrders.filter((o) => paidStatuses.has(o.status));
    const previousPaid = previousOrders.filter((o) =>
      paidStatuses.has(o.status),
    );

    const paidRevenue = paidOrders.reduce(
      (sum, o) => sum + Number(o.price || 0),
      0,
    );
    const previousRevenue = previousPaid.reduce(
      (sum, o) => sum + Number(o.price || 0),
      0,
    );
    const aov = paidOrders.length
      ? Math.round(paidRevenue / paidOrders.length)
      : 0;

    const conversionRate = periodOrders.length
      ? Math.round((paidOrders.length / periodOrders.length) * 1000) / 10
      : 0;

    // Persen growth dibanding periode sebelumnya yang setara durasinya.
    const calcGrowth = (current, previous) => {
      if (!previous) return current ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    const revenueGrowth = calcGrowth(paidRevenue, previousRevenue);
    const ordersGrowth = calcGrowth(paidOrders.length, previousPaid.length);

    // Time series: kalau period <= 30D pakai harian, lainnya bulanan.
    const useDaily = !periodDays || periodDays <= 30;
    const series = [];

    if (useDaily) {
      const days = periodDays || 30;
      for (let i = days - 1; i >= 0; i -= 1) {
        const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayKey = day.toISOString().slice(0, 10);
        series.push({
          key: dayKey,
          label: dayKey.slice(5),
          revenue: 0,
          orders: 0,
          ts: day.getTime(),
        });
      }
      const idx = Object.fromEntries(series.map((s, i) => [s.key, i]));
      for (const order of paidOrders) {
        const k = new Date(order.created_at || Date.now())
          .toISOString()
          .slice(0, 10);
        if (k in idx) {
          series[idx[k]].revenue += Number(order.price || 0);
          series[idx[k]].orders += 1;
        }
      }
    } else {
      const months = periodDays === 90 ? 3 : 12;
      const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
      for (let i = 0; i < months; i += 1) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        series.push({
          key,
          label: monthLabel(key),
          revenue: 0,
          orders: 0,
          ts: d.getTime(),
        });
      }
      const idx = Object.fromEntries(series.map((s, i) => [s.key, i]));
      for (const order of paidOrders) {
        const k = monthKey(order.created_at || Date.now());
        if (k in idx) {
          series[idx[k]].revenue += Number(order.price || 0);
          series[idx[k]].orders += 1;
        }
      }
    }

    const peak = series.reduce(
      (best, cur) => (cur.revenue > best.revenue ? cur : best),
      { revenue: 0, label: "-" },
    );

    // Top 5 produk berdasarkan revenue di periode aktif.
    const productAgg = {};
    for (const order of paidOrders) {
      const key = order.product_name || `#${order.product_id}`;
      if (!productAgg[key])
        productAgg[key] = { name: key, revenue: 0, orders: 0 };
      productAgg[key].revenue += Number(order.price || 0);
      productAgg[key].orders += 1;
    }
    const topProducts = Object.values(productAgg)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const statusCount = periodOrders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    return {
      periodDays,
      paidRevenue,
      previousRevenue,
      revenueGrowth,
      paidOrders: paidOrders.length,
      previousPaidOrders: previousPaid.length,
      ordersGrowth,
      aov,
      conversionRate,
      totalOrders: periodOrders.length,
      series,
      seriesMode: useDaily ? "daily" : "monthly",
      peak,
      topProducts,
      statusCount,
    };
  }, [orders, reportPeriod]);

  const pagedProducts = useMemo(
    () => paginateArray(products, productsPage, 10),
    [products, productsPage],
  );
  const pagedStock = useMemo(
    () => paginateArray(stockData?.stock || [], stockPage, 10),
    [stockData?.stock, stockPage],
  );
  const pagedOrders = useMemo(
    () => paginateArray(filteredOrders, ordersPage, 10),
    [filteredOrders, ordersPage],
  );
  const pagedUsers = useMemo(
    () => paginateArray(filteredUsers, usersPage, 10),
    [filteredUsers, usersPage],
  );

  useEffect(() => {
    if (productsPage !== pagedProducts.page)
      setProductsPage(pagedProducts.page);
  }, [productsPage, pagedProducts.page]);

  useEffect(() => {
    if (stockPage !== pagedStock.page) setStockPage(pagedStock.page);
  }, [stockPage, pagedStock.page]);

  useEffect(() => {
    if (ordersPage !== pagedOrders.page) setOrdersPage(pagedOrders.page);
  }, [ordersPage, pagedOrders.page]);

  useEffect(() => {
    if (usersPage !== pagedUsers.page) setUsersPage(pagedUsers.page);
  }, [usersPage, pagedUsers.page]);

  const activeMenu = NAV_ITEMS.find((item) => item.key === tab);
  const systemStatus = bootstrap?.systemStatus || { secrets: {}, vars: {} };
  const brandName = bootstrap?.brand?.name || "Admin Panel";
  const brandShortName = bootstrap?.brand?.shortName || "INV";
  const broadcastTitle = bootstrap?.brand?.broadcastTitle || "Pengumuman Resmi";

  // Update document title saat bootstrap data diterima.
  useEffect(() => {
    if (typeof document !== "undefined" && bootstrap?.brand?.name) {
      document.title = bootstrap.brand.name;
    }
  }, [bootstrap?.brand?.name]);

  useEffect(() => {
    document.body.classList.toggle("mobile-nav-locked", mobileNavOpen);

    return () => {
      document.body.classList.remove("mobile-nav-locked");
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!authed) return;

    const intervalMs = [
      "stock",
      "orders",
      "payments",
      "dashboard",
      "users",
    ].includes(tab)
      ? 5000
      : 10000;
    const timer = setInterval(() => {
      syncLiveData();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [authed, tab, selectedProductId]);

  useEffect(() => {
    if (!authed || tab !== "broadcast") return;
    let cancelled = false;
    api
      .broadcastJobs(5)
      .then((jobs) => {
        if (!cancelled) setBroadcastHistory(jobs || []);
      })
      .catch(() => {
        // Silent: history bukan critical, biarin saja kalau gagal.
      });
    return () => {
      cancelled = true;
    };
  }, [authed, tab, broadcastJob?.status]);

  if (checkingAuth) {
    return (
      <main className="login-screen">
        <div className="mesh" />
        <div className="login-card">
          <h1>{brandName} Control</h1>
          <p>Checking secure session...</p>
        </div>
      </main>
    );
  }

  if (!authed) {
    return (
      <LoginPage
        password={password}
        setPassword={setPassword}
        onLogin={onLogin}
        error={error}
        loading={loading}
        brandName={brandName}
      />
    );
  }

  return (
    <main className="admin-shell">
      {mobileNavOpen ? (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={`sidebar ${collapsedSidebar ? "collapsed" : ""} ${mobileNavOpen ? "open" : ""}`}
      >
        <div className="mobile-sidebar-head">
          <div>
            <strong>Navigation</strong>
            <span>Admin Console</span>
          </div>
          <button
            className="icon-btn"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close sidebar"
          >
            <Icon type="close" />
          </button>
        </div>

        <div className="brand-wrap">
          <button
            className="icon-btn"
            onClick={() => setCollapsedSidebar((v) => !v)}
            aria-label="Toggle sidebar"
          >
            <Icon type="menu" />
          </button>
          <div className="brand-copy">
            <strong>{(brandName || "Admin Panel").toUpperCase()}</strong>
            <span>Admin Console</span>
          </div>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`nav-item ${tab === item.key ? "active" : ""}`}
              onClick={() => {
                setTab(item.key);
                setMobileNavOpen(false);
              }}
            >
              <Icon type={item.key} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button className="nav-item logout" onClick={logout} disabled={loading}>
          <Icon type="logout" />
          <span>Logout</span>
        </button>
      </aside>

      <section className="main-pane">
        <button
          className={`mobile-nav-toggle ${mobileNavOpen ? "is-open" : ""}`}
          onClick={() => setMobileNavOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <span className="mobile-nav-toggle__icon">
            <Icon type={mobileNavOpen ? "close" : "menu"} />
          </span>
          <span className="mobile-nav-toggle__copy">
            <strong>Menu</strong>
            <small>{activeMenu ? activeMenu.label : "Dashboard"}</small>
          </span>
        </button>

        <header className="topbar">
          <div>
            <p className="eyebrow">Operations</p>
            <h1>{activeMenu ? activeMenu.label : "Dashboard"}</h1>
          </div>
          <div className="actions">
            <button className="ghost" onClick={reloadAll} disabled={loading}>
              <Icon type="refresh" /> Refresh
            </button>
          </div>
        </header>

        {loading ? <div className="loading-bar" /> : null}

        {tab === "dashboard" && bootstrap ? (
          <section className="grid">
            <div className="card wide dashboard-hero">
              <div className="hero-text">
                <span className="eyebrow">Today's Snapshot</span>
                <h2 className="hero-amount">
                  Rp {formatIdr(bootstrap.stats.revenueToday || 0)}
                </h2>
                <p className="hint">
                  {bootstrap.stats.ordersToday || 0} order hari ini.{" "}
                  {(() => {
                    const today = Number(bootstrap.stats.revenueToday || 0);
                    const yest = Number(bootstrap.stats.revenueYesterday || 0);
                    if (!yest && !today) return "Belum ada transaksi.";
                    if (!yest) return "Kemarin belum ada transaksi.";
                    const diff = ((today - yest) / yest) * 100;
                    const sign = diff >= 0 ? "+" : "";
                    return `${sign}${diff.toFixed(1)}% vs kemarin (Rp ${formatIdr(yest)})`;
                  })()}
                </p>
              </div>
              <div className="hero-spark">
                <Sparkline
                  data={bootstrap.stats.spark || []}
                  width={320}
                  height={80}
                />
                <div className="hero-spark-foot">
                  <span>14 hari terakhir</span>
                  <strong>
                    Rp{" "}
                    {formatIdr(
                      (bootstrap.stats.spark || []).reduce(
                        (s, d) => s + d.revenue,
                        0,
                      ),
                    )}
                  </strong>
                </div>
              </div>
            </div>

            <div className="kpi-grid">
              <article className="kpi-card">
                <span className="kpi-label">Total Revenue</span>
                <strong className="kpi-value">
                  Rp {formatIdr(bootstrap.stats.totalRevenue)}
                </strong>
                <span className="kpi-trend neutral">All time</span>
              </article>

              <article className="kpi-card">
                <span className="kpi-label">Revenue 7D</span>
                <strong className="kpi-value">
                  Rp {formatIdr(bootstrap.stats.revenue7d || 0)}
                </strong>
                <span className="kpi-trend neutral">
                  {bootstrap.stats.ordersLast7d || 0} paid orders
                </span>
              </article>

              <article className="kpi-card">
                <span className="kpi-label">Active Products</span>
                <strong className="kpi-value">
                  {bootstrap.stats.totalProducts}
                </strong>
                <span className="kpi-trend neutral">
                  {bootstrap.stats.paidOrders} paid total
                </span>
              </article>

              <article className="kpi-card">
                <span className="kpi-label">Total Users</span>
                <strong className="kpi-value">
                  {bootstrap.stats.totalUsers}
                </strong>
                <span className="kpi-trend neutral">
                  +{bootstrap.stats.newUsers7d || 0} this week
                </span>
              </article>

              <article
                className={`kpi-card ${(bootstrap.stats.pendingOrders || 0) > 0 ? "attention" : ""}`}
              >
                <span className="kpi-label">Pending Orders</span>
                <strong className="kpi-value">
                  {bootstrap.stats.pendingOrders}
                </strong>
                <span className="kpi-trend neutral">
                  {(bootstrap.stats.pendingOrders || 0) > 0
                    ? "menunggu pembayaran"
                    : "tidak ada antrian"}
                </span>
              </article>

              <article className="kpi-card">
                <span className="kpi-label">Conversion Rate</span>
                <strong className="kpi-value">
                  {(() => {
                    const paid = Number(bootstrap.stats.paidOrders || 0);
                    const totalOrders = Number(orders.length || 0);
                    if (!totalOrders) return "0%";
                    return `${((paid / totalOrders) * 100).toFixed(1)}%`;
                  })()}
                </strong>
                <span className="kpi-trend neutral">paid / total orders</span>
              </article>
            </div>

            <div className="card wide chart-card">
              <header className="chart-head">
                <div>
                  <h2>Recent Transactions</h2>
                  <p className="hint">12 order terbaru di sistem.</p>
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setTab("orders")}
                >
                  Lihat semua <Icon type="arrow-right" />
                </button>
              </header>

              {bootstrap.recentOrders.length === 0 ? (
                <p className="hint hint-empty">Belum ada transaksi.</p>
              ) : (
                <ul className="recent-list">
                  {bootstrap.recentOrders.map((o) => (
                    <li key={o.id} className="recent-item">
                      <div className="recent-avatar" aria-hidden="true">
                        {(o.first_name || o.username || "?")
                          .charAt(0)
                          .toUpperCase()}
                      </div>
                      <div className="recent-main">
                        <strong className="recent-product">
                          {o.product_name}
                        </strong>
                        <span className="recent-meta">
                          #{o.id} · {o.first_name || "-"}
                          {o.username ? ` · @${o.username}` : ""}
                        </span>
                      </div>
                      <div className="recent-amount">
                        <strong>Rp {formatIdr(o.price)}</strong>
                        <span className={`badge ${o.status}`}>{o.status}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : null}

        {tab === "products" ? (
          <section className="grid">
            <div className="card wide product-form-card">
              <header className="section-head">
                <div>
                  <h2>
                    {editingProductId
                      ? `Edit Product #${editingProductId}`
                      : "Create Product"}
                  </h2>
                  <p className="hint">
                    {editingProductId
                      ? "Update detail, harga, dan media produk. Klik Cancel Edit untuk membuat produk baru."
                      : "Isi detail produk lalu Create Product. Aktifkan toggle stok ∞ untuk file digital seperti source code atau ebook."}
                  </p>
                </div>
                {editingProductId ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={resetProductForm}
                  >
                    <Icon type="close" /> Cancel Edit
                  </button>
                ) : null}
              </header>

              <form className="form-grid product-form" onSubmit={submitProduct}>
                <label className="field">
                  <span>Product Name</span>
                  <input
                    placeholder="Contoh: ChatGPT Plus 1 Bulan"
                    value={productForm.name}
                    onChange={(e) =>
                      setProductForm({ ...productForm, name: e.target.value })
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span>Category</span>
                  <input
                    placeholder="Contoh: Premium Account"
                    value={productForm.category}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        category: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Price (Rp)</span>
                  <input
                    type="number"
                    min={1000}
                    placeholder="Minimal Rp 1.000"
                    value={productForm.price}
                    onChange={(e) =>
                      setProductForm({ ...productForm, price: e.target.value })
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span>Short Description</span>
                  <input
                    placeholder="Deskripsi singkat untuk buyer"
                    value={productForm.description}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        description: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="field form-full">
                  <span>
                    Delivery Note{" "}
                    <small className="field-optional">
                      muncul di pesan delivery setelah pembayaran sukses,
                      support HTML basic
                    </small>
                  </span>
                  <textarea
                    rows={4}
                    placeholder="Contoh: Jangan ganti password akun. Login pakai 2fa.live untuk OTP. Tidak boleh share ke orang lain."
                    value={productForm.delivery_note}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        delivery_note: e.target.value,
                      })
                    }
                  />
                </label>

                <label className="field form-full">
                  <span>
                    Terms / Panduan URL{" "}
                    <small className="field-optional">
                      opsional, muncul sebagai tombol di bot
                    </small>
                  </span>
                  <input
                    placeholder="https://yourdomain.com/syarat-akun-chatgpt"
                    value={productForm.terms_url}
                    onChange={(e) =>
                      setProductForm({
                        ...productForm,
                        terms_url: e.target.value,
                      })
                    }
                  />
                </label>

                <div className="form-full unlimited-toggle">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={!!productForm.is_unlimited_stock}
                      onChange={(e) =>
                        setProductForm({
                          ...productForm,
                          is_unlimited_stock: e.target.checked,
                        })
                      }
                    />
                    <span>Stok tak terbatas (file digital / source code)</span>
                  </label>
                  <p className="hint">
                    Aktifkan untuk produk seperti source code, ebook, atau file
                    digital lain. Stok otomatis ∞, setiap pembeli dapat link
                    download unik dari 1 file yang sama.
                  </p>

                  {productForm.is_unlimited_stock ? (
                    <>
                      <label className="file-upload">
                        <span>
                          {uploadingDigitalFile
                            ? "Uploading digital file..."
                            : "📦 Upload file digital ke R2 (sumber download)"}
                        </span>
                        <input
                          type="file"
                          onChange={(e) =>
                            uploadProductDigitalFile(e.target.files?.[0])
                          }
                          disabled={uploadingDigitalFile}
                        />
                      </label>
                      <input
                        placeholder="file:downloads/... (auto-fill setelah upload)"
                        value={productForm.digital_file_pointer}
                        onChange={(e) =>
                          setProductForm({
                            ...productForm,
                            digital_file_pointer: e.target.value,
                          })
                        }
                      />
                      {productForm.digital_file_pointer ? (
                        <p className="hint">
                          Pointer aktif:{" "}
                          <code>{productForm.digital_file_pointer}</code>
                        </p>
                      ) : (
                        <p className="hint">
                          Upload file dulu, pointer akan terisi otomatis.
                        </p>
                      )}
                    </>
                  ) : null}
                </div>

                <div className="form-full form-actions">
                  <button disabled={loading}>
                    <Icon type={editingProductId ? "save" : "plus"} />
                    {editingProductId ? "Update Product" : "Create Product"}
                  </button>
                </div>
              </form>
            </div>

            <div className="card wide">
              <header className="section-head">
                <div>
                  <h2>Product Catalog</h2>
                  <p className="hint">{products.length} produk aktif</p>
                </div>
              </header>

              {products.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📦</span>
                  <strong>Belum ada produk</strong>
                  <p>Buat produk pertama lewat form di atas.</p>
                </div>
              ) : (
                <div className="product-gallery">
                  {pagedProducts.items.map((p) => {
                    const isUnlimited = Number(p.is_unlimited_stock) === 1;
                    const stockBadge = isUnlimited
                      ? {
                          label: "∞ Unlimited",
                          className: "stock-badge unlimited",
                        }
                      : Number(p.stock_count) === 0
                        ? { label: "Habis", className: "stock-badge empty" }
                        : Number(p.stock_count) <= 3
                          ? {
                              label: `${p.stock_count} sisa`,
                              className: "stock-badge low",
                            }
                          : {
                              label: `${p.stock_count} stok`,
                              className: "stock-badge ok",
                            };

                    return (
                      <article className="product-tile" key={p.id}>
                        <div className="product-tile-media">
                          <div className="product-tile-placeholder">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className={stockBadge.className}>
                            {stockBadge.label}
                          </span>
                        </div>
                        <div className="product-tile-body">
                          <span className="product-tile-cat">
                            {p.category || "Umum"} · #{p.id}
                          </span>
                          <h3 className="product-tile-name">{p.name}</h3>
                          <strong className="product-tile-price">
                            Rp {formatIdr(p.price)}
                          </strong>
                          {p.description ? (
                            <p className="product-tile-desc">{p.description}</p>
                          ) : null}
                        </div>
                        <div className="product-tile-actions">
                          <button
                            className="ghost"
                            onClick={() => loadStock(p.id)}
                            title="Manage Stock"
                          >
                            <Icon type="stock" />
                          </button>
                          <button
                            className="ghost"
                            onClick={() => startEditProduct(p)}
                            title="Edit produk"
                          >
                            <Icon type="edit" />
                          </button>
                          {Number(p.is_unlimited_stock) === 1 ? (
                            <button
                              className="ghost"
                              onClick={() => openNotifyModal(p)}
                              title="Push update ke semua buyer (khusus produk digital)"
                            >
                              <Icon type="send" />
                            </button>
                          ) : null}
                          <button
                            className="danger"
                            onClick={() => removeProduct(p.id)}
                            title="Hapus"
                          >
                            <Icon type="trash" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              <Pager
                page={pagedProducts.page}
                totalPages={pagedProducts.totalPages}
                onPrev={() => setProductsPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  setProductsPage((p) =>
                    Math.min(pagedProducts.totalPages, p + 1),
                  )
                }
              />
            </div>
          </section>
        ) : null}

        {tab === "stock" ? (
          <section className="grid">
            <div className="card wide stock-shell">
              <header className="section-head">
                <div>
                  <h2>Stock Management</h2>
                  <p className="hint">
                    Kelola inventory akun atau cek file digital aktif untuk tiap
                    produk.
                  </p>
                </div>
              </header>

              <div className="stock-layout">
                <aside className="stock-aside">
                  <span className="stock-aside-title">Pilih Produk</span>
                  <div className="stock-product-list">
                    {products.map((p) => {
                      const active = Number(selectedProductId) === Number(p.id);
                      const isUnlimited = Number(p.is_unlimited_stock) === 1;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          className={`stock-product-pick ${active ? "active" : ""}`}
                          onClick={() => loadStock(p.id)}
                        >
                          <span className="stock-pick-name">{p.name}</span>
                          <span
                            className={`stock-pick-meta ${isUnlimited ? "unlimited" : ""}`}
                          >
                            {isUnlimited ? "∞" : p.stock_count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <div className="stock-main">
                  {!stockData?.product ? (
                    <div className="empty-state">
                      <span className="empty-icon">📋</span>
                      <strong>Pilih produk dari samping</strong>
                      <p>Stok per item akan muncul di sini.</p>
                    </div>
                  ) : Number(stockData.product.is_unlimited_stock) === 1 ? (
                    <>
                      <div className="stock-summary">
                        <div className="stock-chip ok">
                          <span className="chip-label">Mode</span>
                          <strong>∞ Unlimited</strong>
                        </div>
                        <div className="stock-chip">
                          <span className="chip-label">Produk</span>
                          <strong>{stockData.product.name}</strong>
                        </div>
                      </div>
                      <div className="info-card">
                        <strong>📦 File digital sumber</strong>
                        <p className="hint">
                          File ini di-share ke semua pembeli lewat token
                          download unik (expiry 72 jam, max 5x klik per token).
                        </p>
                        <p className="file-pointer">
                          <code>
                            {stockData.product.digital_file_pointer ||
                              "(belum diupload)"}
                          </code>
                        </p>
                        <p className="hint">
                          Untuk ganti file: edit produk, upload file baru, klik
                          Update Product.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="stock-summary">
                        <div className="stock-chip">
                          <span className="chip-label">Produk</span>
                          <strong>{stockData.product.name}</strong>
                        </div>
                        <div className="stock-chip ok">
                          <span className="chip-label">Available</span>
                          <strong>{stockData.product.stock_count}</strong>
                        </div>
                        <div className="stock-chip muted">
                          <span className="chip-label">Total items</span>
                          <strong>{stockData.stock?.length || 0}</strong>
                        </div>
                        <div className="stock-chip warn">
                          <span className="chip-label">Sold</span>
                          <strong>
                            {
                              (stockData.stock || []).filter((s) => s.is_sold)
                                .length
                            }
                          </strong>
                        </div>
                      </div>

                      <form onSubmit={addStock} className="stock-form">
                        <div className="stock-template-row">
                          <select
                            value={selectedStockTemplate}
                            onChange={(e) =>
                              setSelectedStockTemplate(e.target.value)
                            }
                          >
                            {STOCK_DELIMITER_TEMPLATES.map((tpl) => (
                              <option key={tpl.key} value={tpl.value}>
                                {tpl.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="ghost"
                            onClick={insertStockTemplate}
                          >
                            Insert Template
                          </button>
                        </div>
                        <label className="file-upload stock-file-upload">
                          <span>
                            {uploadingDigitalFile
                              ? "Uploading digital file..."
                              : "📦 Upload file digital ke R2 (auto token link)"}
                          </span>
                          <input
                            type="file"
                            onChange={(e) =>
                              uploadDigitalFile(e.target.files?.[0])
                            }
                            disabled={uploadingDigitalFile}
                          />
                        </label>
                        <p className="hint stock-template-help">
                          Template: <code>{selectedStockTemplate}</code>
                        </p>
                        <p className="hint stock-template-help">
                          Untuk produk download, upload file lalu sistem
                          otomatis menambahkan format{" "}
                          <code>file:downloads/...</code> ke textarea.
                        </p>
                        <textarea
                          rows={5}
                          placeholder="One stock item per line"
                          value={stockInput}
                          onChange={(e) => setStockInput(e.target.value)}
                        />
                        <button disabled={loading}>
                          <Icon type="plus" /> Add Stock Items
                        </button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            </div>

            {stockData?.product &&
            Number(stockData.product.is_unlimited_stock) !== 1 ? (
              <div className="card wide">
                <header className="section-head">
                  <div>
                    <h2>Inventory Items</h2>
                    <p className="hint">
                      {stockData.stock?.length || 0} item ·{" "}
                      {(stockData.stock || []).filter((s) => !s.is_sold).length}{" "}
                      available
                    </p>
                  </div>
                </header>
                {(stockData.stock?.length || 0) === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">📭</span>
                    <strong>Belum ada item stok</strong>
                    <p>Tambah lewat form di atas atau upload file digital.</p>
                  </div>
                ) : (
                  <ul className="stock-items-list">
                    {pagedStock.items.map((s) => (
                      <li
                        key={s.id}
                        className={`stock-item ${s.is_sold ? "sold" : "avail"}`}
                      >
                        <span
                          className={`stock-item-dot ${s.is_sold ? "sold" : "avail"}`}
                          aria-hidden="true"
                        />
                        <div className="stock-item-main">
                          <code className="stock-item-data">{s.data}</code>
                          <span className="stock-item-meta">
                            #{s.id} · {s.is_sold ? "sold" : "available"}
                          </span>
                        </div>
                        {!s.is_sold ? (
                          <button
                            className="danger"
                            onClick={() => deleteStock(s.id)}
                          >
                            Delete
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
                <Pager
                  page={pagedStock.page}
                  totalPages={pagedStock.totalPages}
                  onPrev={() => setStockPage((p) => Math.max(1, p - 1))}
                  onNext={() =>
                    setStockPage((p) => Math.min(pagedStock.totalPages, p + 1))
                  }
                />
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "orders" ? (
          <section className="grid">
            <div className="kpi-grid orders-kpi">
              <article className="kpi-card">
                <span className="kpi-label">Total Orders</span>
                <strong className="kpi-value">{orderStatusCounts.all}</strong>
                <span className="kpi-trend neutral">All status</span>
              </article>
              <article className="kpi-card">
                <span className="kpi-label">Paid / Delivered</span>
                <strong className="kpi-value">{orderStatusCounts.paid}</strong>
                <span className="kpi-trend up">
                  {orderStatusCounts.all
                    ? `${((orderStatusCounts.paid / orderStatusCounts.all) * 100).toFixed(1)}%`
                    : "0%"}
                  <small> conversion</small>
                </span>
              </article>
              <article
                className={`kpi-card ${orderStatusCounts.pending > 0 ? "attention" : ""}`}
              >
                <span className="kpi-label">Pending</span>
                <strong className="kpi-value">
                  {orderStatusCounts.pending}
                </strong>
                <span className="kpi-trend neutral">menunggu pembayaran</span>
              </article>
              <article className="kpi-card">
                <span className="kpi-label">Failed / Expired</span>
                <strong className="kpi-value">
                  {orderStatusCounts.failed}
                </strong>
                <span className="kpi-trend neutral">tidak terkonversi</span>
              </article>
            </div>

            <div className="card wide">
              <header className="section-head">
                <div>
                  <h2>Order Ledger</h2>
                  <p className="hint">
                    {filteredOrders.length} dari {orders.length} order
                    ditampilkan.
                  </p>
                </div>
                <div className="search-box">
                  <span className="search-icon" aria-hidden="true">
                    🔎
                  </span>
                  <input
                    className="search-input"
                    placeholder="Cari ID order, produk, nama, username, user ID"
                    value={orderSearch}
                    onChange={(e) => {
                      setOrderSearch(e.target.value);
                      setOrdersPage(1);
                    }}
                  />
                </div>
              </header>

              <div className="period-switch order-filter">
                {[
                  { key: "all", label: `All (${orderStatusCounts.all})` },
                  { key: "paid", label: `Paid (${orderStatusCounts.paid})` },
                  {
                    key: "pending",
                    label: `Pending (${orderStatusCounts.pending})`,
                  },
                  {
                    key: "failed",
                    label: `Failed (${orderStatusCounts.failed})`,
                  },
                ].map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`period-btn ${orderStatusFilter === s.key ? "active" : ""}`}
                    onClick={() => {
                      setOrderStatusFilter(s.key);
                      setOrdersPage(1);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {filteredOrders.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">📭</span>
                  <strong>Tidak ada order yang cocok</strong>
                  <p>Coba ubah filter status atau kata kunci pencarian.</p>
                </div>
              ) : (
                <ul className="order-list">
                  {pagedOrders.items.map((o) => {
                    const initial = (o.first_name || o.username || "?")
                      .charAt(0)
                      .toUpperCase();
                    return (
                      <li key={o.id} className={`order-row order-${o.status}`}>
                        <div className="order-avatar">{initial}</div>
                        <div className="order-main">
                          <div className="order-title-row">
                            <strong className="order-product">
                              {o.product_name}
                            </strong>
                            <span className={`badge ${o.status}`}>
                              {o.status}
                            </span>
                          </div>
                          <span className="order-meta">
                            #{o.id} · {o.first_name || "-"}
                            {o.username ? ` · @${o.username}` : ""}
                            {" · "}
                            <span title={o.created_at}>
                              {formatRelativeTime(o.created_at)}
                            </span>
                          </span>
                        </div>
                        <div className="order-amount">
                          <strong>Rp {formatIdr(o.price)}</strong>
                          <span>qty {o.quantity}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Pager
                page={pagedOrders.page}
                totalPages={pagedOrders.totalPages}
                onPrev={() => setOrdersPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  setOrdersPage((p) => Math.min(pagedOrders.totalPages, p + 1))
                }
              />
            </div>
          </section>
        ) : null}

        {tab === "payments" ? (
          <section className="grid">
            <div className="card wide">
              <header className="section-head">
                <div>
                  <h2>Review Top Up GoPay</h2>
                  <p className="hint">
                    Cocokkan nominal dan bukti transfer. Persetujuan top up
                    menambahkan saldo wallet 1:1 secara otomatis.
                  </p>
                </div>
                <button
                  className="ghost"
                  onClick={reloadAll}
                  disabled={loading}
                >
                  <Icon type="refresh" /> Refresh
                </button>
              </header>

              {paymentActionMessage ? (
                <p className="success-box">{paymentActionMessage}</p>
              ) : null}

              {!manualPayments.length ? (
                <div className="empty-state">
                  <span className="empty-icon">
                    <Icon type="wallet" />
                  </span>
                  <strong>Belum ada top up untuk diperiksa</strong>
                  <p>
                    Permintaan akan muncul setelah pengguna mengirim bukti
                    pembayaran GoPay.
                  </p>
                </div>
              ) : (
                <div className="payment-review-grid">
                  {manualPayments.map((o) => {
                    const walletTopup = isWalletTopup(o);
                    return (
                      <article
                        key={o.id}
                        className={`payment-review-card order-${o.status} ${walletTopup ? "wallet-topup-card" : "legacy-payment-card"}`}
                      >
                        <div className="payment-proof-wrap">
                          {o.payment_proof_path ? (
                            <img
                              src={`${api.paymentProofUrl(o.id)}?v=${encodeURIComponent(o.proof_submitted_at || o.id)}`}
                              alt={`Bukti pembayaran ${walletTopup ? "top up" : "order"} ${o.id}`}
                              className="payment-proof-image"
                              loading="lazy"
                            />
                          ) : (
                            <div className="payment-proof-empty">
                              Belum ada bukti
                            </div>
                          )}
                        </div>
                        <div className="payment-review-body">
                          <div className="order-title-row">
                            <div className="payment-title-copy">
                              <span
                                className={`payment-kind ${walletTopup ? "topup" : "legacy"}`}
                              >
                                {walletTopup
                                  ? "Wallet top up"
                                  : "Legacy product payment"}
                              </span>
                              <strong>
                                {walletTopup
                                  ? `Top Up #${o.id}`
                                  : `Order #${o.id}`}
                              </strong>
                            </div>
                            <span className={`badge ${o.status}`}>
                              {o.status}
                            </span>
                          </div>
                          <dl className="payment-detail-list">
                            <div>
                              <dt>Pembeli</dt>
                              <dd>
                                {o.first_name || "-"}{" "}
                                {o.username ? `(@${o.username})` : ""}
                                <br />
                                <small>ID {o.user_id}</small>
                              </dd>
                            </div>
                            <div>
                              <dt>{walletTopup ? "Tujuan" : "Produk"}</dt>
                              <dd>
                                {walletTopup
                                  ? "Tambah saldo wallet"
                                  : `${o.product_name} × ${o.quantity}`}
                              </dd>
                            </div>
                            <div>
                              <dt>
                                {walletTopup ? "Saldo ditambahkan" : "Total"}
                              </dt>
                              <dd>
                                <strong>Rp {formatIdr(o.price)}</strong>
                              </dd>
                            </div>
                            <div>
                              <dt>Waktu permintaan</dt>
                              <dd>
                                {formatRelativeTime(o.created_at)}
                                <br />
                                <small>{o.created_at}</small>
                              </dd>
                            </div>
                            <div>
                              <dt>Bukti masuk</dt>
                              <dd>
                                {o.proof_submitted_at
                                  ? formatRelativeTime(o.proof_submitted_at)
                                  : "-"}
                              </dd>
                            </div>
                            <div>
                              <dt>Admin</dt>
                              <dd>{o.payment_reviewed_by || "-"}</dd>
                            </div>
                          </dl>
                          {o.admin_note ? (
                            <p className="payment-note">
                              <strong>Catatan admin:</strong> {o.admin_note}
                            </p>
                          ) : null}
                          {o.payment_rejection_reason ? (
                            <p className="payment-note danger-text">
                              <strong>Alasan:</strong>{" "}
                              {o.payment_rejection_reason}
                            </p>
                          ) : null}
                          {o.delivery_error ? (
                            <p className="payment-note danger-text">
                              <strong>Error pengiriman:</strong>{" "}
                              {o.delivery_error}
                            </p>
                          ) : null}

                          <div className="payment-actions">
                            {o.status === "waiting_confirmation" ? (
                              <>
                                <button
                                  onClick={() => runPaymentAction("approve", o)}
                                  disabled={loading}
                                >
                                  {walletTopup
                                    ? "Setujui & Tambah Saldo"
                                    : "Setujui Pembayaran"}
                                </button>
                                <button
                                  className="danger"
                                  onClick={() => runPaymentAction("reject", o)}
                                  disabled={loading}
                                >
                                  {walletTopup
                                    ? "Tolak Top Up"
                                    : "Tolak Pembayaran"}
                                </button>
                                <button
                                  className="ghost"
                                  onClick={() =>
                                    runPaymentAction("request-proof", o)
                                  }
                                  disabled={loading}
                                >
                                  Minta Bukti Ulang
                                </button>
                              </>
                            ) : null}
                            {o.status === "delivery_pending" &&
                            o.delivery_error ? (
                              <button
                                onClick={() => runPaymentAction("retry", o)}
                                disabled={loading}
                              >
                                {walletTopup
                                  ? "Coba Proses Saldo Kembali"
                                  : "Coba Kirim Produk Kembali"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {tab === "users" ? (
          <section className="grid">
            <div className="kpi-grid users-kpi">
              <article className="kpi-card">
                <span className="kpi-label">Total Users</span>
                <strong className="kpi-value">{users.length}</strong>
                <span className="kpi-trend neutral">
                  Tersinkron dari Telegram
                </span>
              </article>
              <article className="kpi-card">
                <span className="kpi-label">Paying Users</span>
                <strong className="kpi-value">
                  {users.filter((u) => Number(u.paid_orders || 0) > 0).length}
                </strong>
                <span className="kpi-trend neutral">
                  {users.length
                    ? `${((users.filter((u) => Number(u.paid_orders || 0) > 0).length / users.length) * 100).toFixed(1)}% conversion`
                    : "0% conversion"}
                </span>
              </article>
              <article className="kpi-card">
                <span className="kpi-label">Total User Spend</span>
                <strong className="kpi-value">
                  Rp{" "}
                  {formatIdr(
                    users.reduce(
                      (sum, u) => sum + Number(u.total_spent || 0),
                      0,
                    ),
                  )}
                </strong>
                <span className="kpi-trend neutral">Lifetime value</span>
              </article>
              <article className="kpi-card">
                <span className="kpi-label">Avg Spend / User</span>
                <strong className="kpi-value">
                  Rp{" "}
                  {formatIdr(
                    users.length
                      ? Math.round(
                          users.reduce(
                            (sum, u) => sum + Number(u.total_spent || 0),
                            0,
                          ) / users.length,
                        )
                      : 0,
                  )}
                </strong>
                <span className="kpi-trend neutral">Across all users</span>
              </article>
            </div>

            <div className="card wide">
              <header className="section-head">
                <div>
                  <h2>User Management</h2>
                  <p className="hint">
                    Data tersinkron otomatis dari aktivitas bot Telegram.
                  </p>
                </div>
                <div className="search-box">
                  <span className="search-icon" aria-hidden="true">
                    🔎
                  </span>
                  <input
                    className="search-input"
                    placeholder="Cari nama, username, atau user ID"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
              </header>

              {filteredUsers.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">👤</span>
                  <strong>Tidak ada user yang cocok</strong>
                  <p>Coba kata kunci lain atau kosongkan kolom pencarian.</p>
                </div>
              ) : (
                <ul className="user-list">
                  {pagedUsers.items.map((u) => {
                    const initial = (u.first_name || u.username || "?")
                      .charAt(0)
                      .toUpperCase();
                    const isVip = Number(u.paid_orders || 0) >= 3;
                    const isBlocked = Number(u.is_blocked || 0) === 1;
                    return (
                      <li key={u.user_id} className="user-row">
                        <div
                          className={`user-avatar ${isVip ? "vip" : ""} ${isBlocked ? "blocked" : ""}`}
                        >
                          {initial}
                        </div>
                        <div className="user-main">
                          <div className="user-name-row">
                            <strong>{u.first_name || "(no name)"}</strong>
                            {u.username ? (
                              <span className="user-handle">@{u.username}</span>
                            ) : null}
                            {isVip ? (
                              <span className="vip-badge">VIP</span>
                            ) : null}
                            {isBlocked ? (
                              <span className="blocked-badge">BLOCKED</span>
                            ) : null}
                          </div>
                          <span className="user-meta">
                            ID {u.user_id} · last active {u.last_active || "-"}
                          </span>
                        </div>
                        <div className="user-stats">
                          <div className="user-stat">
                            <span>Orders</span>
                            <strong>{u.total_orders || 0}</strong>
                          </div>
                          <div className="user-stat">
                            <span>Paid</span>
                            <strong>{u.paid_orders || 0}</strong>
                          </div>
                          <div className="user-stat">
                            <span>Spent</span>
                            <strong>Rp {formatIdr(u.total_spent)}</strong>
                          </div>
                        </div>
                        <div className="user-actions">
                          <button
                            className="ghost btn-xs"
                            onClick={() => loadUserDetail(u.user_id)}
                          >
                            <Icon type="eye" /> Detail
                          </button>
                          <button
                            className={`ghost btn-xs ${isBlocked ? "" : "danger"}`}
                            onClick={() => {
                              if (
                                confirm(
                                  isBlocked
                                    ? `Unblock user ${u.first_name || u.user_id}?`
                                    : `Block user ${u.first_name || u.user_id}?`,
                                )
                              ) {
                                toggleBlockUser(u.user_id, !isBlocked);
                              }
                            }}
                          >
                            {isBlocked ? "✅ Unblock" : "🚫 Block"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Pager
                page={pagedUsers.page}
                totalPages={pagedUsers.totalPages}
                onPrev={() => setUsersPage((p) => Math.max(1, p - 1))}
                onNext={() =>
                  setUsersPage((p) => Math.min(pagedUsers.totalPages, p + 1))
                }
              />
            </div>

            {userDetailModal ? (
              <div
                className="notify-modal-backdrop"
                onClick={() => setUserDetailModal(null)}
              >
                <div
                  className="notify-modal notify-modal-wide"
                  onClick={(e) => e.stopPropagation()}
                >
                  <header className="notify-modal-head">
                    <div>
                      <span className="invoice-eyebrow">USER DETAIL</span>
                      <h3>
                        {userDetailModal.user?.first_name ||
                          userDetailModal.user?.username ||
                          userDetailModal.user?.user_id}
                      </h3>
                    </div>
                    <button
                      className="ghost"
                      onClick={() => setUserDetailModal(null)}
                    >
                      <Icon type="close" />
                    </button>
                  </header>

                  <div
                    className="kpi-grid users-kpi"
                    style={{ marginBottom: "16px" }}
                  >
                    <article className="kpi-card">
                      <span className="kpi-label">User ID</span>
                      <strong className="kpi-value mono-key">
                        {userDetailModal.user?.user_id}
                      </strong>
                    </article>
                    <article className="kpi-card">
                      <span className="kpi-label">Username</span>
                      <strong className="kpi-value">
                        {userDetailModal.user?.username
                          ? `@${userDetailModal.user.username}`
                          : "-"}
                      </strong>
                    </article>
                    <article className="kpi-card">
                      <span className="kpi-label">Wallet Balance</span>
                      <strong className="kpi-value">
                        Rp {formatIdr(userDetailModal.wallet?.balance)}
                      </strong>
                    </article>
                    <article className="kpi-card">
                      <span className="kpi-label">Status</span>
                      <strong className="kpi-value">
                        {Number(userDetailModal.user?.is_blocked)
                          ? "🚫 Blocked"
                          : "✅ Active"}
                      </strong>
                    </article>
                  </div>

                  <h4 style={{ margin: "12px 0 8px" }}>
                    Recent Orders ({userDetailModal.orders?.length || 0})
                  </h4>
                  {userDetailModal.orders?.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Product</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userDetailModal.orders.slice(0, 10).map((o) => (
                            <tr key={o.id}>
                              <td>{o.id}</td>
                              <td>{o.product_name}</td>
                              <td>Rp {formatIdr(o.price)}</td>
                              <td>
                                <span className={`badge ${o.status}`}>
                                  {o.status}
                                </span>
                              </td>
                              <td>{formatRelativeTime(o.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="hint">Belum ada order.</p>
                  )}

                  <h4 style={{ margin: "12px 0 8px" }}>
                    Recent Wallet Transactions (
                    {userDetailModal.walletTxns?.length || 0})
                  </h4>
                  {userDetailModal.walletTxns?.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Balance After</th>
                            <th>Desc</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {userDetailModal.walletTxns
                            .slice(0, 10)
                            .map((t, i) => (
                              <tr key={i}>
                                <td>
                                  <span
                                    className={`badge ${t.type?.includes("credit") || t.type === "topup" ? "paid" : "expired"}`}
                                  >
                                    {t.type}
                                  </span>
                                </td>
                                <td>Rp {formatIdr(t.amount)}</td>
                                <td>Rp {formatIdr(t.balance_after)}</td>
                                <td className="td-truncate">
                                  {t.description || "-"}
                                </td>
                                <td>{formatRelativeTime(t.created_at)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="hint">Belum ada transaksi wallet.</p>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "reports" ? (
          <section className="grid">
            <div className="card wide reports-toolbar">
              <div>
                <h2 className="reports-title">Performance Insight</h2>
                <p className="hint">
                  Pantau revenue, conversion, dan tren order kamu secara
                  realtime.
                </p>
              </div>
              <div className="period-switch">
                {[
                  { key: "7d", label: "7 Days" },
                  { key: "30d", label: "30 Days" },
                  { key: "90d", label: "90 Days" },
                  { key: "all", label: "All Time" },
                ].map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className={`period-btn ${reportPeriod === p.key ? "active" : ""}`}
                    onClick={() => setReportPeriod(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="kpi-grid">
              <article className="kpi-card">
                <span className="kpi-label">Paid Revenue</span>
                <strong className="kpi-value">
                  Rp {formatIdr(reportSummary.paidRevenue)}
                </strong>
                {reportSummary.periodDays ? (
                  <span
                    className={`kpi-trend ${reportSummary.revenueGrowth >= 0 ? "up" : "down"}`}
                  >
                    {reportSummary.revenueGrowth >= 0 ? "▲" : "▼"}{" "}
                    {Math.abs(reportSummary.revenueGrowth)}%
                    <small> vs prev</small>
                  </span>
                ) : null}
              </article>

              <article className="kpi-card">
                <span className="kpi-label">Paid Orders</span>
                <strong className="kpi-value">
                  {reportSummary.paidOrders}
                </strong>
                {reportSummary.periodDays ? (
                  <span
                    className={`kpi-trend ${reportSummary.ordersGrowth >= 0 ? "up" : "down"}`}
                  >
                    {reportSummary.ordersGrowth >= 0 ? "▲" : "▼"}{" "}
                    {Math.abs(reportSummary.ordersGrowth)}%
                    <small> vs prev</small>
                  </span>
                ) : null}
              </article>

              <article className="kpi-card">
                <span className="kpi-label">Average Order Value</span>
                <strong className="kpi-value">
                  Rp {formatIdr(reportSummary.aov)}
                </strong>
                <span className="kpi-trend neutral">
                  {reportSummary.paidOrders} paid orders
                </span>
              </article>

              <article className="kpi-card">
                <span className="kpi-label">Conversion Rate</span>
                <strong className="kpi-value">
                  {reportSummary.conversionRate}%
                </strong>
                <span className="kpi-trend neutral">
                  {reportSummary.paidOrders} / {reportSummary.totalOrders}{" "}
                  orders
                </span>
              </article>
            </div>

            <div className="card wide chart-card">
              <header className="chart-head">
                <div>
                  <h2>Revenue Trend</h2>
                  <p className="hint">
                    {reportSummary.seriesMode === "daily"
                      ? "Per hari"
                      : "Per bulan"}{" "}
                    - peak <strong>{reportSummary.peak.label}</strong> (Rp{" "}
                    {formatIdr(reportSummary.peak.revenue)})
                  </p>
                </div>
                <span className="chart-badge">
                  {reportSummary.seriesMode === "daily" ? "Daily" : "Monthly"}
                </span>
              </header>
              <RevenueChart
                series={reportSummary.series}
                mode={reportSummary.seriesMode}
              />
            </div>

            <div className="card wide chart-grid">
              <div>
                <header className="chart-head">
                  <h2>Order Status</h2>
                  <p className="hint">
                    Distribusi status order pada periode aktif.
                  </p>
                </header>
                <StatusDonut statusCount={reportSummary.statusCount} />
              </div>

              <div>
                <header className="chart-head">
                  <h2>Top Products</h2>
                  <p className="hint">Produk paling banyak revenue.</p>
                </header>
                {reportSummary.topProducts.length === 0 ? (
                  <p className="hint hint-empty">
                    Belum ada penjualan paid pada periode ini.
                  </p>
                ) : (
                  <ol className="top-products">
                    {reportSummary.topProducts.map((p, idx) => {
                      const max = reportSummary.topProducts[0].revenue || 1;
                      return (
                        <li key={p.name} className="top-product-row">
                          <span className="top-rank">{idx + 1}</span>
                          <div className="top-info">
                            <strong className="top-name">{p.name}</strong>
                            <div className="top-track">
                              <div
                                className="top-fill"
                                style={{
                                  width: `${Math.max(8, Math.round((p.revenue / max) * 100))}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="top-meta">
                            <strong>Rp {formatIdr(p.revenue)}</strong>
                            <span>
                              {p.orders} order{p.orders === 1 ? "" : "s"}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "settings" && bootstrap ? (
          <section className="grid">
            <div className="card wide settings-section">
              <header className="section-head">
                <div>
                  <h2 className="section-title-icon">
                    <Icon type="tag" /> Brand & Identity
                  </h2>
                  <p className="hint">
                    Atur nama toko, tagline, dan link customer service untuk bot
                    Telegram dan panel admin.
                  </p>
                </div>
                <span className="settings-status-pill ok">
                  {brandingForm.shortName || "INV"}
                </span>
              </header>

              <form onSubmit={saveBranding} className="form-grid settings-form">
                <label className="field">
                  <span>Brand Name</span>
                  <input
                    placeholder="Contoh: My Store"
                    value={brandingForm.name}
                    onChange={(e) =>
                      setBrandingForm((p) => ({ ...p, name: e.target.value }))
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span>
                    Short Name{" "}
                    <small className="field-optional">
                      prefix order code, max 8 char
                    </small>
                  </span>
                  <input
                    placeholder="MYS"
                    value={brandingForm.shortName}
                    onChange={(e) =>
                      setBrandingForm((p) => ({
                        ...p,
                        shortName: e.target.value
                          .replace(/[^A-Za-z0-9]/g, "")
                          .toUpperCase()
                          .slice(0, 8),
                      }))
                    }
                    required
                  />
                </label>
                <label className="field form-full">
                  <span>
                    Tagline{" "}
                    <small className="field-optional">
                      muncul di /start bot
                    </small>
                  </span>
                  <input
                    placeholder="Belanja produk digital menggunakan saldo wallet."
                    value={brandingForm.tagline}
                    onChange={(e) =>
                      setBrandingForm((p) => ({
                        ...p,
                        tagline: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field form-full">
                  <span>
                    Broadcast Title{" "}
                    <small className="field-optional">
                      header pesan broadcast
                    </small>
                  </span>
                  <input
                    placeholder="Pengumuman Resmi"
                    value={brandingForm.broadcastTitle}
                    onChange={(e) =>
                      setBrandingForm((p) => ({
                        ...p,
                        broadcastTitle: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    Support Telegram URL{" "}
                    <small className="field-optional">opsional</small>
                  </span>
                  <input
                    placeholder="https://t.me/your_cs"
                    value={brandingForm.supportTelegramUrl}
                    onChange={(e) =>
                      setBrandingForm((p) => ({
                        ...p,
                        supportTelegramUrl: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>
                    Support WhatsApp URL{" "}
                    <small className="field-optional">opsional</small>
                  </span>
                  <input
                    placeholder="https://wa.me/628..."
                    value={brandingForm.supportWhatsappUrl}
                    onChange={(e) =>
                      setBrandingForm((p) => ({
                        ...p,
                        supportWhatsappUrl: e.target.value,
                      }))
                    }
                  />
                </label>
                <div className="form-full form-actions">
                  <button disabled={loading}>
                    <Icon type="save" /> Save Branding
                  </button>
                </div>
              </form>

              <div className="info-card">
                <strong>📋 Preview Order Code</strong>
                <p className="file-pointer">
                  <code>
                    {(brandingForm.shortName || "INV").toUpperCase()}001
                  </code>
                  ,&nbsp;
                  <code>
                    {(brandingForm.shortName || "INV").toUpperCase()}002
                  </code>
                  , ...
                </p>
                <p className="hint">
                  Order code lama tidak diubah. Hanya order baru yang pakai
                  prefix Short Name baru.
                </p>
              </div>
            </div>

            <div className="card wide settings-section">
              <header className="section-head">
                <div>
                  <h2 className="section-title-icon">
                    <Icon type="wallet" /> GoPay Wallet Top Up
                  </h2>
                  <p className="hint">
                    QR statis hanya menerima top up. Pembelian produk selalu
                    memotong saldo wallet pengguna.
                  </p>
                </div>
                <span
                  className={`settings-status-pill ${generalSettings.enabled ? "ok" : "warn"}`}
                >
                  {generalSettings.enabled ? "Active" : "Disabled"}
                </span>
              </header>

              <form
                onSubmit={saveGeneralSettings}
                className="form-grid settings-form"
              >
                <label className="field">
                  <span>Nama Metode</span>
                  <input
                    placeholder="GoPay Merchant QR"
                    value={generalSettings.methodName}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({
                        ...prev,
                        methodName: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Nama Akun Merchant</span>
                  <input
                    placeholder="Ciganstore"
                    value={generalSettings.accountName}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({
                        ...prev,
                        accountName: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field form-full">
                  <span>Top Up Manual</span>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={generalSettings.enabled}
                      onChange={(e) =>
                        setGeneralSettings((prev) => ({
                          ...prev,
                          enabled: e.target.checked,
                        }))
                      }
                    />
                    <span>
                      Izinkan pengguna membuat permintaan top up wallet
                    </span>
                  </label>
                </label>
                <label className="field form-full">
                  <span>Instruksi Top Up</span>
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={generalSettings.instructions}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({
                        ...prev,
                        instructions: e.target.value,
                      }))
                    }
                  />
                </label>

                <label className="field">
                  <span>Telegram Admin ID</span>
                  <input
                    placeholder="Numeric user ID"
                    value={generalSettings.adminTelegramId}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({
                        ...prev,
                        adminTelegramId: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Batas Waktu Top Up (menit)</span>
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    value={generalSettings.checkoutExpiryMinutes}
                    onChange={(e) =>
                      setGeneralSettings((prev) => ({
                        ...prev,
                        checkoutExpiryMinutes: Number(e.target.value || 60),
                      }))
                    }
                  />
                </label>
                <div className="form-full form-actions">
                  <button disabled={loading}>
                    <Icon type="save" /> Simpan Pengaturan Top Up
                  </button>
                </div>
              </form>

              <div className="info-card qris-settings-card">
                <div>
                  <strong>QR GoPay Merchant</strong>
                  <p className="hint">
                    QR ini dikirim hanya saat top up. JPG, PNG, atau WebP;
                    maksimum 2 MB dan disimpan privat.
                  </p>
                  <label className="file-upload">
                    <Icon type="upload" />
                    <span>
                      {uploadingQris
                        ? "Mengunggah..."
                        : "Unggah / Ganti QR GoPay"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingQris}
                      onChange={(e) => uploadQrisImage(e.target.files?.[0])}
                    />
                  </label>
                </div>
                {(bootstrap.walletTopup || bootstrap.manualPayment)
                  ?.qrisConfigured ? (
                  <img
                    src={`${api.qrisImageUrl()}?v=${qrisImageVersion}`}
                    className="qris-settings-preview"
                    alt="QR GoPay merchant aktif untuk top up wallet"
                  />
                ) : (
                  <span className="settings-status-pill warn">
                    Belum ada gambar
                  </span>
                )}
              </div>
            </div>

            <div className="card wide settings-section">
              <header className="section-head">
                <div>
                  <h2 className="section-title-icon">
                    <Icon type="shield" /> System Configuration Status
                  </h2>
                  <p className="hint">
                    Cek apakah secret dan environment variable server yang
                    diperlukan sudah tersedia.
                  </p>
                </div>
              </header>

              <div className="status-check-grid">
                <div>
                  <h3 className="status-title">
                    <Icon type="lock" /> Server Secrets
                  </h3>
                  <div className="status-list">
                    {Object.entries(systemStatus.secrets).map(([key, ok]) => (
                      <div
                        className={`status-pill ${ok ? "ok" : "bad"}`}
                        key={key}
                      >
                        <span>{key}</span>
                        <strong>{ok ? "✓ SET" : "⚠ MISSING"}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="status-title">
                    <Icon type="settings" /> Server Variables
                  </h3>
                  <div className="status-list">
                    {Object.entries(systemStatus.vars).map(([key, ok]) => (
                      <div
                        className={`status-pill ${ok ? "ok" : "bad"}`}
                        key={key}
                      >
                        <span>{key}</span>
                        <strong>{ok ? "✓ SET" : "⚠ MISSING"}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="hint">
                Set nilai sensitif melalui file <code>.env</code> server atau
                secret manager deployment.
              </p>
            </div>

            <div className="card wide settings-section">
              <header className="section-head">
                <div>
                  <h2 className="section-title-icon">
                    <Icon type="link" /> Telegram Webhook
                  </h2>
                  <p className="hint">
                    Otomasi setup webhook bot tanpa curl manual.
                  </p>
                </div>
                <span
                  className={`settings-status-pill ${webhookInfo?.configured ? "ok" : "warn"}`}
                >
                  {webhookInfo?.configured ? "Configured" : "Not configured"}
                </span>
              </header>

              <div className="webhook-actions">
                <button
                  className="ghost"
                  onClick={refreshWebhookStatus}
                  disabled={loading}
                >
                  <Icon type="refresh" /> Check Status
                </button>
                <button onClick={setupWebhook} disabled={loading}>
                  <Icon type="link" /> Setup Webhook
                </button>
                <button
                  className="danger"
                  onClick={deleteWebhook}
                  disabled={loading}
                >
                  <Icon type="trash" /> Delete Webhook
                </button>
              </div>

              {webhookInfo ? (
                <div className="info-card webhook-info">
                  <p>
                    <strong>Expected URL:</strong>{" "}
                    <code>{webhookInfo.expectedUrl}</code>
                  </p>
                  <p>
                    <strong>Current URL:</strong>{" "}
                    <code>{webhookInfo.info?.url || "-"}</code>
                  </p>
                  {webhookInfo.info?.last_error_message ? (
                    <p className="webhook-error">
                      <strong>Last Error:</strong>{" "}
                      {webhookInfo.info.last_error_message}
                    </p>
                  ) : (
                    <p className="hint">No errors reported.</p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="card wide settings-section">
              <header className="section-head">
                <div>
                  <h2 className="section-title-icon">
                    <Icon type="shield" /> Maintenance Mode
                  </h2>
                  <p className="hint">
                    Saat aktif, bot Telegram menampilkan pesan maintenance.
                    Admin panel tetap bisa diakses.
                  </p>
                </div>
                <span
                  className={`settings-status-pill ${maintenanceEnabled ? "warn" : "ok"}`}
                >
                  {maintenanceEnabled ? "🔧 ACTIVE" : "OFF"}
                </span>
              </header>

              <div className="webhook-actions">
                <button
                  className={maintenanceEnabled ? "" : "danger"}
                  onClick={toggleMaintenance}
                >
                  {maintenanceEnabled
                    ? "✅ Nonaktifkan Maintenance"
                    : "🔧 Aktifkan Maintenance Mode"}
                </button>
              </div>

              {maintenanceEnabled ? (
                <div className="info-card">
                  <strong>⚠️ Maintenance Mode sedang AKTIF</strong>
                  <p className="hint">
                    Bot Telegram hanya membalas pesan maintenance untuk pengguna
                    non-admin.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="card wide settings-section">
              <header className="section-head">
                <div>
                  <h2 className="section-title-icon">
                    <Icon type="save" /> Database Backup
                  </h2>
                  <p className="hint">
                    Auto backup harian jam 3 pagi WIB. Simpan 7 backup terakhir.
                  </p>
                </div>
                <span className="settings-status-pill ok">
                  {backups.length} backups
                </span>
              </header>

              <div className="webhook-actions">
                <button onClick={triggerBackup} disabled={loading}>
                  <Icon type="save" /> Backup Sekarang
                </button>
                <button className="ghost" onClick={loadBackups}>
                  <Icon type="refresh" /> Refresh
                </button>
              </div>

              {backups.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>File</th>
                        <th>Size</th>
                        <th>Tanggal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backups.map((b) => (
                        <tr key={b.name}>
                          <td className="mono-key">{b.name}</td>
                          <td>{(b.size / 1024).toFixed(1)} KB</td>
                          <td>{formatRelativeTime(b.date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="hint">
                  Belum ada file backup. Klik tombol di atas untuk backup
                  manual.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {tab === "wallets" ? (
          <section className="grid">
            <div className="card wide">
              <header className="section-head">
                <div>
                  <h2>Wallet Management</h2>
                  <p className="hint">Pantau saldo dan adjust balance user.</p>
                </div>
                <div className="actions">
                  <div className="search-box">
                    <span className="search-icon" aria-hidden="true">
                      🔎
                    </span>
                    <input
                      className="search-input"
                      placeholder="Cari user ID atau nama"
                      value={walletSearch}
                      onChange={(e) => setWalletSearch(e.target.value)}
                    />
                  </div>
                  <button className="ghost" onClick={loadWallets}>
                    <Icon type="refresh" /> Refresh
                  </button>
                </div>
              </header>

              {(() => {
                const filtered = wallets.filter((w) => {
                  if (!walletSearch) return true;
                  const q = walletSearch.toLowerCase();
                  return (
                    String(w.user_id).includes(q) ||
                    (w.username || "").toLowerCase().includes(q) ||
                    (w.first_name || "").toLowerCase().includes(q)
                  );
                });
                const paged = paginateArray(filtered, walletsPage, 15);
                return !filtered.length && !loading ? (
                  <div className="empty-state">
                    <span className="empty-icon">💰</span>
                    <strong>Belum ada wallet</strong>
                    <p>
                      Wallet dibuat otomatis saat user pertama kali mengakses
                      fitur wallet.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>User ID</th>
                            <th>Nama</th>
                            <th>Username</th>
                            <th>Balance</th>
                            <th>Last Active</th>
                            <th>Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paged.items.map((w) => (
                            <tr key={w.user_id}>
                              <td className="mono-key">{w.user_id}</td>
                              <td>{w.first_name || "-"}</td>
                              <td>{w.username ? `@${w.username}` : "-"}</td>
                              <td>
                                <strong>Rp {formatIdr(w.balance)}</strong>
                              </td>
                              <td>{formatRelativeTime(w.last_active)}</td>
                              <td>
                                <button
                                  className="ghost btn-xs"
                                  onClick={() => {
                                    setAdjustModal(w);
                                    setAdjustForm({
                                      amount: "",
                                      description: "",
                                    });
                                    setAdjustMsg("");
                                  }}
                                >
                                  <Icon type="edit" /> Adjust
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pager
                      page={paged.page}
                      totalPages={paged.totalPages}
                      onPrev={() => setWalletsPage((p) => p - 1)}
                      onNext={() => setWalletsPage((p) => p + 1)}
                    />
                  </>
                );
              })()}
            </div>

            {adjustModal ? (
              <div
                className="notify-modal-backdrop"
                onClick={() => setAdjustModal(null)}
              >
                <div
                  className="notify-modal"
                  onClick={(e) => e.stopPropagation()}
                >
                  <header className="notify-modal-head">
                    <div>
                      <span className="invoice-eyebrow">WALLET ADJUSTMENT</span>
                      <h3>
                        {adjustModal.first_name ||
                          adjustModal.username ||
                          adjustModal.user_id}
                      </h3>
                    </div>
                    <button
                      className="ghost"
                      onClick={() => setAdjustModal(null)}
                    >
                      <Icon type="close" />
                    </button>
                  </header>
                  <p className="hint">
                    Saldo saat ini:{" "}
                    <strong>Rp {formatIdr(adjustModal.balance)}</strong>
                  </p>
                  <form onSubmit={submitAdjust} className="form-grid">
                    <label className="field">
                      <span>Jumlah (positif = tambah, negatif = kurang)</span>
                      <input
                        type="number"
                        value={adjustForm.amount}
                        onChange={(e) =>
                          setAdjustForm((p) => ({
                            ...p,
                            amount: e.target.value,
                          }))
                        }
                        required
                        placeholder="misal: 10000 atau -5000"
                      />
                    </label>
                    <label className="field">
                      <span>Deskripsi / Alasan</span>
                      <input
                        value={adjustForm.description}
                        onChange={(e) =>
                          setAdjustForm((p) => ({
                            ...p,
                            description: e.target.value,
                          }))
                        }
                        required
                        placeholder="misal: Koreksi saldo test"
                      />
                    </label>
                    {adjustMsg ? (
                      <p
                        className={`hint ${adjustMsg.startsWith("✅") ? "" : "error-text"}`}
                      >
                        {adjustMsg}
                      </p>
                    ) : null}
                    <div className="form-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setAdjustModal(null)}
                      >
                        Batal
                      </button>
                      <button
                        disabled={!adjustForm.amount || !adjustForm.description}
                      >
                        <Icon type="save" /> Simpan
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "broadcast" ? (
          <section className="grid">
            <div className="card wide broadcast-shell">
              <header className="section-head">
                <div>
                  <h2>Broadcast Center</h2>
                  <p className="hint">
                    Kirim pengumuman ke semua user aktif. Pesan dikirim per
                    chunk dengan respect rate limit Telegram. User yang block
                    bot otomatis di-skip.
                  </p>
                </div>
              </header>

              <div className="broadcast-layout">
                <form onSubmit={sendBroadcast} className="broadcast-form">
                  <label className="field">
                    <span>
                      Message{" "}
                      <small className="field-optional">
                        {broadcastForm.message.length} chars
                      </small>
                    </span>
                    <textarea
                      rows={7}
                      placeholder="Tulis pesan broadcast... (HTML basic <b>, <i>, <a> didukung)"
                      value={broadcastForm.message}
                      onChange={(e) =>
                        setBroadcastForm((prev) => ({
                          ...prev,
                          message: e.target.value,
                        }))
                      }
                      required
                    />
                  </label>

                  <div className="broadcast-cta-grid">
                    <label className="field">
                      <span>
                        CTA Button Text{" "}
                        <small className="field-optional">opsional</small>
                      </span>
                      <input
                        placeholder="Lihat Promo"
                        value={broadcastForm.buttonText}
                        onChange={(e) =>
                          setBroadcastForm((prev) => ({
                            ...prev,
                            buttonText: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>CTA Button URL</span>
                      <input
                        placeholder="https://..."
                        value={broadcastForm.buttonUrl}
                        onChange={(e) =>
                          setBroadcastForm((prev) => ({
                            ...prev,
                            buttonUrl: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  <button disabled={loading || !broadcastForm.message.trim()}>
                    <Icon type="send" /> Send to All Active Users
                  </button>
                </form>

                <aside className="broadcast-preview" aria-label="Preview pesan">
                  <span className="preview-label">Live Preview · Telegram</span>
                  <div className="tg-preview">
                    <div className="tg-bubble">
                      <strong className="tg-bot-name">Your Bot</strong>
                      <p className="tg-text">
                        📢 <strong>{broadcastTitle}</strong>
                        <br />
                        ━━━━━━━━━━━━━━━━━━━━
                        <br />
                        <br />
                        {broadcastForm.message.trim() || (
                          <span className="tg-placeholder">
                            Pesan broadcast akan muncul di sini...
                          </span>
                        )}
                      </p>
                      {broadcastForm.buttonText && broadcastForm.buttonUrl ? (
                        <a
                          className="tg-cta"
                          href={broadcastForm.buttonUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {broadcastForm.buttonText} →
                        </a>
                      ) : null}
                      <span className="tg-time">just now</span>
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            {broadcastResult ? (
              <div className="card wide">
                <header className="section-head">
                  <div>
                    <h2>
                      {broadcastJob?.status === "done"
                        ? "✅ Broadcast Selesai"
                        : broadcastJob?.status === "failed"
                          ? "⚠️ Broadcast Gagal"
                          : "⏳ Broadcast Sedang Berjalan"}
                    </h2>
                    <p className="hint">
                      Job #{broadcastResult.jobId} ·{" "}
                      {broadcastJob?.recipients ?? broadcastResult.recipients}{" "}
                      recipients
                    </p>
                  </div>
                  <span
                    className={`settings-status-pill ${
                      broadcastJob?.status === "done"
                        ? "ok"
                        : broadcastJob?.status === "failed"
                          ? "warn"
                          : "warn"
                    }`}
                  >
                    {broadcastJob?.status?.toUpperCase() || "QUEUED"}
                  </span>
                </header>

                {(() => {
                  const total = Number(
                    broadcastJob?.recipients ?? broadcastResult.recipients ?? 0,
                  );
                  const sent = Number(broadcastJob?.sent ?? 0);
                  const failed = Number(broadcastJob?.failed ?? 0);
                  const blocked = Number(broadcastJob?.blocked ?? 0);
                  const processed = sent + failed + blocked;
                  const pct = total ? Math.round((processed / total) * 100) : 0;

                  return (
                    <>
                      <div className="broadcast-progress-track">
                        <div
                          className="broadcast-progress-fill"
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                      <div className="broadcast-progress-meta">
                        <span>
                          {processed} / {total} processed
                        </span>
                        <strong>{pct}%</strong>
                      </div>
                      <div className="broadcast-stats-grid">
                        <div className="broadcast-stat ok">
                          <span>Sent</span>
                          <strong>{sent}</strong>
                        </div>
                        <div className="broadcast-stat warn">
                          <span>Failed</span>
                          <strong>{failed}</strong>
                        </div>
                        <div className="broadcast-stat muted">
                          <span>Blocked</span>
                          <strong>{blocked}</strong>
                        </div>
                        <div className="broadcast-stat">
                          <span>Pending</span>
                          <strong>{Math.max(0, total - processed)}</strong>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {broadcastJob?.last_error ? (
                  <p className="webhook-error">
                    Last error: <code>{broadcastJob.last_error}</code>
                  </p>
                ) : null}
                {broadcastJob?.status !== "done" &&
                broadcastJob?.status !== "failed" ? (
                  <p className="hint">
                    Kamu boleh tinggal halaman ini, broadcast tetap jalan di
                    server. Buka tab Broadcast lagi nanti untuk lihat progress
                    terbaru.
                  </p>
                ) : null}
              </div>
            ) : null}

            {broadcastHistory.length > 0 ? (
              <div className="card wide">
                <header className="section-head">
                  <div>
                    <h2>Recent Broadcast History</h2>
                    <p className="hint">5 broadcast terakhir.</p>
                  </div>
                </header>
                <ul className="broadcast-history">
                  {broadcastHistory.map((j) => {
                    const total = Number(j.recipients || 0);
                    const processed =
                      Number(j.sent || 0) +
                      Number(j.failed || 0) +
                      Number(j.blocked || 0);
                    const pct = total
                      ? Math.round((processed / total) * 100)
                      : 0;
                    const preview = String(j.message || "").slice(0, 80);
                    return (
                      <li key={j.id} className="broadcast-history-item">
                        <div className="bh-head">
                          <strong className="bh-id">Job #{j.id}</strong>
                          <span
                            className={`settings-status-pill ${j.status === "done" ? "ok" : "warn"}`}
                          >
                            {j.status?.toUpperCase()}
                          </span>
                        </div>
                        <p className="bh-preview">
                          {preview}
                          {j.message?.length > 80 ? "..." : ""}
                        </p>
                        <div className="bh-meta">
                          <span>{formatRelativeTime(j.created_at)}</span>
                          <span>·</span>
                          <span>
                            {j.sent}/{total} sent
                          </span>
                          {Number(j.blocked || 0) > 0 ? (
                            <>
                              <span>·</span>
                              <span>{j.blocked} blocked</span>
                            </>
                          ) : null}
                        </div>
                        <div className="broadcast-progress-track small">
                          <div
                            className="broadcast-progress-fill"
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}
      </section>

      {tab === "reviews" ? (
        <div className="grid">
          <div className="card wide">
            <div className="section-head">
              <div>
                <h2>Reviews & Ratings</h2>
                <p className="hint">Kelola review dari buyer.</p>
              </div>
              <div className="actions">
                <button className="ghost" onClick={loadReviews}>
                  <Icon type="refresh" /> Refresh
                </button>
              </div>
            </div>

            {!reviews.length && !loading ? (
              <div className="empty-state">
                <span className="empty-icon">⭐</span>
                <strong>Belum ada review</strong>
                <p>Review akan muncul setelah buyer memberikan rating.</p>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Product</th>
                        <th>Rating</th>
                        <th>Review</th>
                        <th>Tanggal</th>
                        <th>Visible</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginateArray(reviews, reviewsPage, 15).items.map(
                        (r) => (
                          <tr
                            key={r.id}
                            style={r.visible ? {} : { opacity: 0.5 }}
                          >
                            <td>{r.user_name || r.user_id}</td>
                            <td>{r.product_name || "-"}</td>
                            <td>{"⭐".repeat(r.rating || 0)}</td>
                            <td className="td-truncate">{r.text || "-"}</td>
                            <td>{formatRelativeTime(r.created_at)}</td>
                            <td>
                              <span
                                className={`badge ${r.visible ? "paid" : "expired"}`}
                              >
                                {r.visible ? "Visible" : "Hidden"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="ghost btn-xs"
                                onClick={() => toggleReview(r.id, !r.visible)}
                              >
                                <Icon type="eye" />{" "}
                                {r.visible ? "Hide" : "Show"}
                              </button>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={paginateArray(reviews, reviewsPage, 15).page}
                  totalPages={
                    paginateArray(reviews, reviewsPage, 15).totalPages
                  }
                  onPrev={() => setReviewsPage((p) => p - 1)}
                  onNext={() => setReviewsPage((p) => p + 1)}
                />
              </>
            )}
          </div>
        </div>
      ) : null}

      {tab === "tickets" ? (
        <div className="grid">
          <div className="card wide">
            <div className="section-head">
              <div>
                <h2>Support Tickets</h2>
                <p className="hint">Kelola tiket bantuan dari buyer.</p>
              </div>
              <div className="actions">
                <div className="inline">
                  {["all", "open", "replied", "closed"].map((f) => (
                    <button
                      key={f}
                      className={`btn-filter ${ticketFilter === f ? "" : "ghost"}`}
                      onClick={() => {
                        setTicketFilter(f);
                      }}
                    >
                      {f === "all" ? "Semua" : f}
                    </button>
                  ))}
                </div>
                <button className="ghost" onClick={loadTickets}>
                  <Icon type="refresh" /> Refresh
                </button>
              </div>
            </div>

            {selectedTicket && ticketDetail ? (
              <div>
                <button
                  className="ghost btn-back"
                  onClick={() => {
                    setSelectedTicket(null);
                    setTicketDetail(null);
                  }}
                >
                  ← Kembali ke daftar
                </button>

                <div className="ticket-detail-head">
                  <div>
                    <strong className="ticket-detail-title">
                      Ticket #{ticketDetail.id}
                    </strong>
                    <span className={`badge ${ticketDetail.status}`}>
                      {ticketDetail.status}
                    </span>
                  </div>
                  {ticketDetail.status !== "closed" && (
                    <button
                      className="danger btn-xs"
                      onClick={() => closeTicket(ticketDetail.id)}
                    >
                      Close Ticket
                    </button>
                  )}
                </div>
                <p className="hint">
                  User: {ticketDetail.user_name || ticketDetail.user_id} —{" "}
                  {formatRelativeTime(ticketDetail.created_at)}
                </p>

                <div className="ticket-chat-wrap">
                  {(ticketDetail.messages || []).map((m, i) => (
                    <div
                      key={i}
                      className={`ticket-bubble ${m.role === "admin" ? "admin" : "user"}`}
                    >
                      <div className="ticket-sender">
                        {m.role === "admin" ? "👨‍💼 Admin" : "👤 User"}
                      </div>
                      <div className="ticket-text">{m.message}</div>
                      <div className="ticket-time">
                        {formatRelativeTime(m.created_at)}
                      </div>
                    </div>
                  ))}
                </div>

                {ticketDetail.status !== "closed" && (
                  <div className="ticket-reply-bar">
                    <textarea
                      rows={2}
                      placeholder="Tulis balasan..."
                      value={ticketReply}
                      onChange={(e) => setTicketReply(e.target.value)}
                      className="ticket-reply-input"
                    />
                    <button
                      className="ticket-reply-send"
                      disabled={loading || !ticketReply.trim()}
                      onClick={sendTicketReply}
                    >
                      <Icon type="send" /> Kirim
                    </button>
                  </div>
                )}
              </div>
            ) : !tickets.length && !loading ? (
              <div className="empty-state">
                <span className="empty-icon">💬</span>
                <strong>Belum ada tiket</strong>
                <p>
                  Tiket support akan muncul saat buyer membuat permintaan
                  bantuan.
                </p>
              </div>
            ) : (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>User</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>Tanggal</th>
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginateArray(tickets, ticketsPage, 15).items.map(
                        (t) => (
                          <tr key={t.id}>
                            <td>{t.id}</td>
                            <td>{t.user_name || t.user_id}</td>
                            <td className="td-truncate">
                              {t.subject || t.last_message || "-"}
                            </td>
                            <td>
                              <span className={`badge ${t.status}`}>
                                {t.status}
                              </span>
                            </td>
                            <td>{formatRelativeTime(t.created_at)}</td>
                            <td>
                              <button
                                className="ghost btn-xs"
                                onClick={() => loadTicketDetail(t.id)}
                              >
                                <Icon type="eye" /> Detail
                              </button>
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
                <Pager
                  page={paginateArray(tickets, ticketsPage, 15).page}
                  totalPages={
                    paginateArray(tickets, ticketsPage, 15).totalPages
                  }
                  onPrev={() => setTicketsPage((p) => p - 1)}
                  onNext={() => setTicketsPage((p) => p + 1)}
                />
              </>
            )}
          </div>
        </div>
      ) : null}

      {notifyModal ? (
        <div className="notify-modal-backdrop" onClick={closeNotifyModal}>
          <div className="notify-modal" onClick={(e) => e.stopPropagation()}>
            <header className="notify-modal-head">
              <div>
                <span className="invoice-eyebrow">
                  PUSH UPDATE · DIGITAL FILE
                </span>
                <h3>{notifyModal.product.name}</h3>
              </div>
              <button
                className="ghost"
                onClick={closeNotifyModal}
                aria-label="Tutup"
              >
                <Icon type="close" />
              </button>
            </header>

            <div className="notify-meta">
              <div className="stock-chip ok">
                <span className="chip-label">Buyer Paid</span>
                <strong>{notifyModal.info.totalBuyers}</strong>
              </div>
              <div className="stock-chip muted">
                <span className="chip-label">File aktif</span>
                <strong className="mono-key">
                  {notifyModal.info.digitalFilePointer || "(belum ada)"}
                </strong>
              </div>
            </div>

            {notifyModal.info.totalBuyers === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📭</span>
                <strong>Belum ada buyer paid</strong>
                <p>Tidak ada user yang akan dinotifikasi.</p>
              </div>
            ) : notifyResult ? (
              <div className="info-card">
                <strong>✅ Notifikasi terkirim ke background</strong>
                <p>{notifyResult.message}</p>
                <p className="hint">
                  Pesan dikirim per chunk dengan respect rate limit Telegram.
                  Tiap buyer dapat link download unik baru (token expiry 72 jam,
                  max 5x).
                </p>
                <div className="form-actions">
                  <button className="ghost" onClick={closeNotifyModal}>
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submitNotifyUpdate} className="form-grid">
                <label className="field form-full">
                  <span>Pesan Update</span>
                  <textarea
                    rows={5}
                    placeholder="Tulis pesan update untuk buyer..."
                    value={notifyForm.message}
                    onChange={(e) =>
                      setNotifyForm((p) => ({ ...p, message: e.target.value }))
                    }
                    required
                  />
                </label>

                <p className="hint form-full">
                  Setiap buyer otomatis dapat link download unik baru dari file
                  aktif di atas (token expiry 72 jam, max 5x click).
                </p>

                <div className="form-full form-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={closeNotifyModal}
                  >
                    <Icon type="close" /> Batal
                  </button>
                  <button disabled={loading || !notifyForm.message.trim()}>
                    <Icon type="send" /> Kirim ke {notifyModal.info.totalBuyers}{" "}
                    Buyer
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
