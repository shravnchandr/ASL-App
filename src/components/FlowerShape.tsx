import React from 'react';

interface FlowerShapeProps {
    size?: number;
    fill?: string;
    petals?: number;
    children?: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
}

export const FlowerShape: React.FC<FlowerShapeProps> = ({
    size = 100,
    fill = 'currentColor',
    petals = 8,
    children,
    style,
    className,
}) => {
    const r = 50;
    const inner = 40;
    let d = '';
    for (let i = 0; i < petals * 2; i++) {
        const angle = (i / (petals * 2)) * Math.PI * 2;
        const radius = i % 2 === 0 ? r : inner;
        const x = 50 + radius * Math.cos(angle - Math.PI / 2);
        const y = 50 + radius * Math.sin(angle - Math.PI / 2);
        // Use quadratic bezier for smooth petal curves on outer points
        if (i % 2 === 0 && i > 0) {
            const prevAngle = ((i - 1) / (petals * 2)) * Math.PI * 2;
            const cpRadius = r + 5;
            const cpX = 50 + cpRadius * Math.cos(prevAngle + (Math.PI / (petals * 2)) - Math.PI / 2);
            const cpY = 50 + cpRadius * Math.sin(prevAngle + (Math.PI / (petals * 2)) - Math.PI / 2);
            d += `Q ${cpX},${cpY} ${x},${y} `;
        } else {
            d += (i === 0 ? 'M' : 'L') + `${x},${y} `;
        }
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
