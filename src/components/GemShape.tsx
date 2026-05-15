import React from 'react';

interface GemShapeProps {
    size?: number;
    fill?: string;
    children?: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
}

export const GemShape: React.FC<GemShapeProps> = ({
    size = 80,
    fill = 'currentColor',
    children,
    style,
    className,
}) => {
    const sides = 7;
    const r = 38;
    const cornerRadius = 13;

    const vertices = Array.from({ length: sides }, (_, i) => {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
        return { x: 50 + r * Math.cos(angle), y: 50 + r * Math.sin(angle) };
    });

    let d = '';
    for (let i = 0; i < sides; i++) {
        const curr = vertices[i];
        const prev = vertices[(i - 1 + sides) % sides];
        const next = vertices[(i + 1) % sides];

        const toPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
        const toNext = { x: next.x - curr.x, y: next.y - curr.y };
        const prevLen = Math.hypot(toPrev.x, toPrev.y);
        const nextLen = Math.hypot(toNext.x, toNext.y);
        const cr = Math.min(cornerRadius, prevLen / 2, nextLen / 2);

        const p1 = { x: curr.x + (toPrev.x / prevLen) * cr, y: curr.y + (toPrev.y / prevLen) * cr };
        const p2 = { x: curr.x + (toNext.x / nextLen) * cr, y: curr.y + (toNext.y / nextLen) * cr };

        d += i === 0 ? `M ${p1.x} ${p1.y} ` : `L ${p1.x} ${p1.y} `;
        d += `Q ${curr.x} ${curr.y} ${p2.x} ${p2.y} `;
    }
    d += 'Z';

    return (
        <div
            className={className}
            style={{ width: size, height: size, position: 'relative', flexShrink: 0, ...style }}
        >
            <svg
                viewBox="0 0 100 100"
                width={size}
                height={size}
                style={{ position: 'absolute', inset: 0 }}
                aria-hidden="true"
            >
                <path d={d} fill={fill} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
                {children}
            </div>
        </div>
    );
};
