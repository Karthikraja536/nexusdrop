export function GlassPanel({ className = "", children, ...props }) {
  return <div className={`glass-panel p-6 ${className}`} {...props}>{children}</div>;
}

export function Card({ className = "", children, ...props }) {
  return <div className={`glass-card p-6 ${className}`} {...props}>{children}</div>;
}
