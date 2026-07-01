import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SignData, SignFrame, Coordinate } from '../../types';
import './SignAnimator.css';

interface SignAnimatorProps {
    signData: SignData | null;
    isPlaying: boolean;
    playbackSpeed: number;
    size: 'xs' | 'card' | 'small' | 'medium' | 'large';
    onAnimationEnd?: () => void;
    onFrameChange?: (frame: number) => void;
}

const POSE_CONNECTIONS: [number, number][] = [
    [11, 12], [11, 23], [12, 24], [23, 24], // torso
    [11, 13], [13, 15],                      // left arm
    [12, 14], [14, 16],                      // right arm
];

const UPPER_BODY_INDICES = [11, 12, 13, 14, 15, 16, 23, 24];

const FACE_CONNECTIONS: [number, number][] = [
    [10, 8], [8, 12], [12, 9], [9, 13],
    [24, 22], [22, 26], [26, 23], [23, 27],
    [6, 18], [18, 14], [14, 15], [15, 6],
    [28, 31], [31, 20], [20, 29], [29, 28],
    [7, 11], [11, 21], [21, 25], [25, 7],
    [0, 3], [3, 5], [5, 4], [4, 0],
    [1, 2],
    [16, 17], [17, 19], [19, 30], [30, 32],
];

const HAND_CONNECTIONS: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],     // thumb
    [0, 5], [5, 6], [6, 7], [7, 8],     // index
    [0, 9], [9, 10], [10, 11], [11, 12], // middle
    [0, 13], [13, 14], [14, 15], [15, 16], // ring
    [0, 17], [17, 18], [18, 19], [19, 20], // pinky
    [5, 9], [9, 13], [13, 17],           // palm
];

const COLORS_LIGHT = {
    body: '#1a232f',
    leftHand: '#1a232f',
    rightHand: '#1a232f',
    face: '#1a232f',
};

const COLORS_DARK = {
    body: '#e4dfd0',
    leftHand: '#e4dfd0',
    rightHand: '#e4dfd0',
    face: '#e4dfd0',
};


const SIZE_CONFIG = {
    xs:    { width: 100, height: 108, lineWidth: 1.1, pointRadius: 1.3, handPointRadius: 1.1, handZoomSize: 0 },
    card:  { width: 130, height: 140, lineWidth: 1.3, pointRadius: 1.6, handPointRadius: 1.3, handZoomSize: 55 },
    small: { width: 200, height: 200, lineWidth: 1.5, pointRadius: 2,   handPointRadius: 1.5, handZoomSize: 80 },
    medium:{ width: 300, height: 300, lineWidth: 2,   pointRadius: 3,   handPointRadius: 2,   handZoomSize: 100 },
    large: { width: 400, height: 400, lineWidth: 2.5, pointRadius: 4,   handPointRadius: 2.5, handZoomSize: 120 },
};

export const SignAnimator: React.FC<SignAnimatorProps> = ({
    signData,
    isPlaying,
    playbackSpeed = 1,
    size = 'medium',
    onAnimationEnd,
    onFrameChange,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const handCanvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef<number>(0);
    const [currentFrame, setCurrentFrame] = useState(0);
    const [isDarkMode, setIsDarkMode] = useState(false);

    const config = SIZE_CONFIG[size];
    const handZoomSize = config.handZoomSize;

    useEffect(() => {
        const checkDarkMode = () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            setIsDarkMode(isDark);
        };
        checkDarkMode();

        const observer = new MutationObserver(checkDarkMode);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        return () => observer.disconnect();
    }, []);

    const computeTransform = useCallback((frame: SignFrame) => {
        const allCoords: [number, number][] = [];

        const addCoords = (coords: Coordinate[], indices?: number[]) => {
            const list = indices ? indices.map(i => coords[i]) : coords;
            for (const c of list) {
                if (c && !isNaN(c[0]) && !isNaN(c[1])) {
                    allCoords.push([c[0], c[1]]);
                }
            }
        };

        if (frame.pose) addCoords(frame.pose, UPPER_BODY_INDICES);
        if (frame.left_hand) addCoords(frame.left_hand);
        if (frame.right_hand) addCoords(frame.right_hand);
        if (frame.face) addCoords(frame.face);

        if (allCoords.length === 0) {
            return { scale: 1, dataCenterX: 0.5, dataCenterY: 0.5 };
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const [x, y] of allCoords) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }

        const dataWidth = maxX - minX || 0.1;
        const dataHeight = maxY - minY || 0.1;
        const dataCenterX = (minX + maxX) / 2;
        const dataCenterY = (minY + maxY) / 2;

        const padding = 0.1;
        const availableWidth = config.width * (1 - 2 * padding);
        const availableHeight = config.height * (1 - 2 * padding);
        const scale = Math.min(availableWidth / dataWidth, availableHeight / dataHeight);

        return { scale, dataCenterX, dataCenterY };
    }, [config.width, config.height]);

    const transformRef = useRef({ scale: 1, dataCenterX: 0.5, dataCenterY: 0.5 });

    const transformCoord = useCallback((coord: Coordinate): [number, number] | null => {
        if (!coord) return null;
        const [x, y] = coord;
        if (isNaN(x) || isNaN(y)) return null;

        const { scale, dataCenterX, dataCenterY } = transformRef.current;
        const canvasCenterX = config.width / 2;
        // Shift center down 8% to leave room for the estimated head above the bounding box
        const canvasCenterY = config.height / 2 + config.height * 0.08;

        // Flip X for mirror view
        return [
            canvasCenterX - (x - dataCenterX) * scale,
            canvasCenterY + (y - dataCenterY) * scale
        ];
    }, [config.width, config.height]);

    const drawLine = useCallback((
        ctx: CanvasRenderingContext2D,
        p1: [number, number] | null,
        p2: [number, number] | null,
        color: string
    ) => {
        if (!p1 || !p2) return;
        ctx.beginPath();
        ctx.moveTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.strokeStyle = color;
        ctx.lineWidth = config.lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
    }, [config.lineWidth]);

    const drawPoint = useCallback((
        ctx: CanvasRenderingContext2D,
        point: [number, number] | null,
        color: string,
        radius: number = config.pointRadius
    ) => {
        if (!point) return;
        ctx.beginPath();
        ctx.arc(point[0], point[1], radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    }, [config.pointRadius]);

    const drawPose = useCallback((
        ctx: CanvasRenderingContext2D,
        pose: Coordinate[],
        leftHand: Coordinate[] | null,
        rightHand: Coordinate[] | null,
        ink: string
    ) => {
        for (const [i, j] of POSE_CONNECTIONS) {
            const p1 = transformCoord(pose[i]);
            const p2 = transformCoord(pose[j]);
            drawLine(ctx, p1, p2, ink);
        }

        if (leftHand && leftHand[0]) {
            drawLine(ctx, transformCoord(pose[15]), transformCoord(leftHand[0]), ink);
        }
        if (rightHand && rightHand[0]) {
            drawLine(ctx, transformCoord(pose[16]), transformCoord(rightHand[0]), ink);
        }

        for (const i of UPPER_BODY_INDICES) {
            const point = transformCoord(pose[i]);
            const isMainJoint = [11, 12, 23, 24].includes(i);
            drawPoint(ctx, point, ink, isMainJoint ? config.pointRadius : config.pointRadius * 0.7);
        }
    }, [transformCoord, drawLine, drawPoint, config.pointRadius]);

    const drawHand = useCallback((
        ctx: CanvasRenderingContext2D,
        hand: Coordinate[],
        color: string
    ) => {
        for (const [i, j] of HAND_CONNECTIONS) {
            const p1 = transformCoord(hand[i]);
            const p2 = transformCoord(hand[j]);
            if (p1 && p2) {
                ctx.beginPath();
                ctx.moveTo(p1[0], p1[1]);
                ctx.lineTo(p2[0], p2[1]);
                ctx.strokeStyle = color;
                ctx.lineWidth = config.lineWidth * 0.7;
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        }

        for (let i = 0; i < hand.length; i++) {
            const point = transformCoord(hand[i]);
            if (!point) continue;
            const isFingertip = [4, 8, 12, 16, 20].includes(i);
            const isWrist = i === 0;
            let radius = config.handPointRadius;
            if (isFingertip) radius *= 1.3;
            if (isWrist) radius *= 1.5;
            drawPoint(ctx, point, color, radius);
        }
    }, [transformCoord, drawPoint, config.lineWidth, config.handPointRadius]);

    const estimateHeadFromPose = useCallback((pose: Coordinate[]): { centerX: number; centerY: number; radiusX: number; radiusY: number } | null => {
        const leftShoulder = pose[11] ? transformCoord(pose[11]) : null;
        const rightShoulder = pose[12] ? transformCoord(pose[12]) : null;

        if (!leftShoulder || !rightShoulder) return null;

        const shoulderCenterX = (leftShoulder[0] + rightShoulder[0]) / 2;
        const shoulderCenterY = (leftShoulder[1] + rightShoulder[1]) / 2;
        const shoulderWidth = Math.abs(rightShoulder[0] - leftShoulder[0]);

        // Head is ~1/2 shoulder width, taller than wide
        const headWidth = shoulderWidth * 0.5;
        const headHeight = headWidth * 1.3;
        const headCenterY = shoulderCenterY - headHeight * 1.2;

        return {
            centerX: shoulderCenterX,
            centerY: headCenterY,
            radiusX: headWidth / 2,
            radiusY: headHeight / 2
        };
    }, [transformCoord]);

    const drawFace = useCallback((
        ctx: CanvasRenderingContext2D,
        face: Coordinate[],
        pose?: Coordinate[],
        ink: string = '#1a232f'
    ) => {
        const validPoints: [number, number][] = [];
        for (const coordinate of face) {
            const point = coordinate ? transformCoord(coordinate) : null;
            if (point) validPoints.push(point);
        }

        let headBounds: { centerX: number; centerY: number; radiusX: number; radiusY: number } | null = null;
        if (validPoints.length >= 5) {
            const xs = validPoints.map(point => point[0]);
            const ys = validPoints.map(point => point[1]);
            headBounds = {
                centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
                centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
                radiusX: (Math.max(...xs) - Math.min(...xs)) / 2 * 1.3,
                radiusY: (Math.max(...ys) - Math.min(...ys)) / 2 * 1.4,
            };
        } else if (pose) {
            headBounds = estimateHeadFromPose(pose);
        }

        if (!headBounds) return;

        ctx.beginPath();
        ctx.ellipse(headBounds.centerX, headBounds.centerY, headBounds.radiusX, headBounds.radiusY, 0, 0, Math.PI * 2);
        ctx.strokeStyle = ink;
        ctx.lineWidth = config.lineWidth * 0.6;
        ctx.stroke();

        ctx.lineWidth = config.lineWidth * 0.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const [i, j] of FACE_CONNECTIONS) {
            if (!face[i] || !face[j]) continue;
            const p1 = transformCoord(face[i]);
            const p2 = transformCoord(face[j]);
            if (!p1 || !p2) continue;
            ctx.beginPath();
            ctx.moveTo(p1[0], p1[1]);
            ctx.lineTo(p2[0], p2[1]);
            ctx.stroke();
        }
    }, [transformCoord, config.lineWidth, estimateHeadFromPose]);

    const renderHandZoom = useCallback((hand: Coordinate[], color: string, label: string) => {
        const canvas = handCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = handZoomSize;

        ctx.clearRect(0, 0, size, size);
        if (isDarkMode) {
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, size, size);
        }

        const validPoints: { idx: number; coord: [number, number, number] }[] = [];
        for (let i = 0; i < hand.length; i++) {
            const c = hand[i];
            if (c) validPoints.push({ idx: i, coord: c });
        }

        if (validPoints.length < 5) {
            ctx.fillStyle = '#999';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No hand', size / 2, size / 2);
            return;
        }

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const { coord } of validPoints) {
            minX = Math.min(minX, coord[0]);
            maxX = Math.max(maxX, coord[0]);
            minY = Math.min(minY, coord[1]);
            maxY = Math.max(maxY, coord[1]);
        }

        const dataWidth = maxX - minX || 0.01;
        const dataHeight = maxY - minY || 0.01;
        const dataCenterX = (minX + maxX) / 2;
        const dataCenterY = (minY + maxY) / 2;

        const padding = 0.15;
        const availableSize = size * (1 - 2 * padding);
        const scale = Math.min(availableSize / dataWidth, availableSize / dataHeight);
        const canvasCenter = size / 2;

        const transform = (coord: Coordinate): [number, number] | null => {
            if (!coord) return null;
            return [
                canvasCenter - (coord[0] - dataCenterX) * scale, // mirror X
                canvasCenter + (coord[1] - dataCenterY) * scale,
            ];
        };

        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';

        for (const [i, j] of HAND_CONNECTIONS) {
            if (hand[i] && hand[j]) {
                const p1 = transform(hand[i]);
                const p2 = transform(hand[j]);
                if (p1 && p2) {
                    ctx.beginPath();
                    ctx.moveTo(p1[0], p1[1]);
                    ctx.lineTo(p2[0], p2[1]);
                    ctx.stroke();
                }
            }
        }

        for (let i = 0; i < hand.length; i++) {
            if (hand[i]) {
                const p = transform(hand[i]);
                if (p) {
                    const isFingertip = [4, 8, 12, 16, 20].includes(i);
                    const radius = isFingertip ? 3 : 2;
                    ctx.beginPath();
                    ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
                    ctx.fillStyle = color;
                    ctx.fill();
                }
            }
        }

        ctx.fillStyle = color;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, size / 2, size - 4);
    }, [handZoomSize, isDarkMode]);

    const renderFrame = useCallback((frame: SignFrame) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        transformRef.current = computeTransform(frame);

        ctx.clearRect(0, 0, config.width, config.height);
        if (isDarkMode) {
            ctx.fillStyle = '#111827';
            ctx.fillRect(0, 0, config.width, config.height);
        }

        const colors = isDarkMode ? COLORS_DARK : COLORS_LIGHT;
        const ink = colors.body;

        if (frame.pose) drawPose(ctx, frame.pose, frame.left_hand, frame.right_hand, ink);
        drawFace(ctx, frame.face || [], frame.pose || undefined, ink);
        if (frame.left_hand) drawHand(ctx, frame.left_hand, colors.leftHand);
        if (frame.right_hand) drawHand(ctx, frame.right_hand, colors.rightHand);

        if (frame.right_hand) {
            renderHandZoom(frame.right_hand, colors.rightHand, 'Right Hand');
        } else if (frame.left_hand) {
            renderHandZoom(frame.left_hand, colors.leftHand, 'Left Hand');
        }
    }, [config.width, config.height, isDarkMode, computeTransform, drawPose, drawFace, drawHand, renderHandZoom]);

    const animate = useCallback((timestamp: number) => {
        if (!signData || !isPlaying) return;

        const frameInterval = 1000 / (signData.fps * playbackSpeed);
        const elapsed = timestamp - lastFrameTimeRef.current;

        if (elapsed >= frameInterval) {
            lastFrameTimeRef.current = timestamp;

            setCurrentFrame(prevFrame => {
                const nextFrame = prevFrame + 1;
                if (nextFrame >= signData.frame_count) {
                    onAnimationEnd?.();
                    return 0;
                }
                onFrameChange?.(nextFrame);
                return nextFrame;
            });
        }

        animationRef.current = requestAnimationFrame(animate);
    }, [signData, isPlaying, playbackSpeed, onAnimationEnd, onFrameChange]);

    useEffect(() => {
        if (isPlaying && signData) {
            lastFrameTimeRef.current = performance.now();
            animationRef.current = requestAnimationFrame(animate);
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isPlaying, signData, animate]);

    useEffect(() => {
        if (signData && signData.frames[currentFrame]) {
            renderFrame(signData.frames[currentFrame]);
        }
    }, [signData, currentFrame, renderFrame]);

    useEffect(() => {
        if (signData && signData.frames[0]) {
            renderFrame(signData.frames[0]);
        }
    }, [signData, renderFrame]);

    useEffect(() => {
        setCurrentFrame(0);
    }, [signData?.sign]);

    const showZoom = config.handZoomSize > 0;
    const showInfo = size === 'large';

    if (!signData) {
        return (
            <div className={`sign-animator sign-animator--${size}`}>
                <div className="sign-animator__placeholder" />
            </div>
        );
    }

    return (
        <div className={`sign-animator sign-animator--${size}`}>
            <div className="sign-animator__main">
                <canvas
                    ref={canvasRef}
                    width={config.width}
                    height={config.height}
                    className="sign-animator__canvas"
                    aria-label={`Animation of the sign for "${signData.sign}"`}
                />
                {showZoom && (
                    <div className="sign-animator__hand-zoom">
                        <canvas
                            ref={handCanvasRef}
                            width={handZoomSize}
                            height={handZoomSize}
                            className="sign-animator__hand-canvas"
                            aria-label="Zoomed view of hand"
                        />
                    </div>
                )}
            </div>
            {showInfo && (
                <div className="sign-animator__info">
                    <span className="sign-animator__frame">
                        Frame {currentFrame + 1} / {signData.frame_count}
                    </span>
                </div>
            )}
        </div>
    );
};

export default SignAnimator;
