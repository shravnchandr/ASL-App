/**
 * SignAnimator Component
 * Canvas-based renderer for ASL sign animations using MediaPipe landmark data
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import type { SignData, SignFrame, Coordinate } from '../../types';
import './SignAnimator.css';

interface SignAnimatorProps {
    signData: SignData | null;
    isPlaying: boolean;
    playbackSpeed: number;
    size: 'small' | 'medium' | 'large';
    onAnimationEnd?: () => void;
    onFrameChange?: (frame: number) => void;
}

// MediaPipe pose connections for skeleton (upper body only)
const POSE_CONNECTIONS: [number, number][] = [
    // Torso
    [11, 12], // shoulders
    [11, 23], [12, 24], // shoulders to hips
    [23, 24], // hips
    // Left arm
    [11, 13], [13, 15], // shoulder -> elbow -> wrist
    // Right arm
    [12, 14], [14, 16], // shoulder -> elbow -> wrist
];

// Upper body pose indices we care about
const UPPER_BODY_INDICES = [11, 12, 13, 14, 15, 16, 23, 24];

// Face outline connections (based on our reduced face indices)
// Our face indices are: [0,1,4,13,14,17,33,61,63,66,70,78,105,107,133,145,148,152,159,176,263,291,293,296,300,308,334,336,362,374,377,386,400]
// Map: 0=mouth(0), 1=nose(1), 2=nose(4), 3=mouth(13), 4=mouth(14), 5=mouth(17), 6=left_eye(33), 7=mouth(61),
//      8=left_eyebrow(63), 9=left_eyebrow(66), 10=left_eyebrow(70), 11=mouth(78), 12=left_eyebrow(105), 13=left_eyebrow(107),
//      14=left_eye(133), 15=left_eye(145), 16=chin(148), 17=chin(152), 18=left_eye(159), 19=chin(176),
//      20=right_eye(263), 21=mouth(291), 22=right_eyebrow(293), 23=right_eyebrow(296), 24=right_eyebrow(300),
//      25=mouth(308), 26=right_eyebrow(334), 27=right_eyebrow(336), 28=right_eye(362), 29=right_eye(374),
//      30=chin(377), 31=right_eye(386), 32=chin(400)
const FACE_CONNECTIONS: [number, number][] = [
    // Left eyebrow
    [10, 8], [8, 12], [12, 9], [9, 13],
    // Right eyebrow
    [24, 22], [22, 26], [26, 23], [23, 27],
    // Left eye
    [6, 18], [18, 14], [14, 15], [15, 6],
    // Right eye
    [28, 31], [31, 20], [20, 29], [29, 28],
    // Mouth outer
    [7, 11], [11, 21], [21, 25], [25, 7],
    // Mouth inner
    [0, 3], [3, 5], [5, 4], [4, 0],
    // Nose
    [1, 2],
    // Chin outline
    [16, 17], [17, 19], [19, 30], [30, 32],
];

// Hand connections (finger joints)
const HAND_CONNECTIONS: [number, number][] = [
    // Thumb
    [0, 1], [1, 2], [2, 3], [3, 4],
    // Index
    [0, 5], [5, 6], [6, 7], [7, 8],
    // Middle
    [0, 9], [9, 10], [10, 11], [11, 12],
    // Ring
    [0, 13], [13, 14], [14, 15], [15, 16],
    // Pinky
    [0, 17], [17, 18], [18, 19], [19, 20],
    // Palm
    [5, 9], [9, 13], [13, 17],
];

// Colors
const COLORS = {
    body: '#2196F3',        // Blue
    leftHand: '#4CAF50',    // Green
    rightHand: '#FF9800',   // Orange
    face: '#9C27B0',        // Purple
    background: '#1a1a2e',
    backgroundLight: '#f5f5f5',
};

const SIZE_CONFIG = {
    small: { width: 200, height: 200, lineWidth: 1.5, pointRadius: 2, handPointRadius: 1.5, handZoomSize: 80 },
    medium: { width: 300, height: 300, lineWidth: 2, pointRadius: 3, handPointRadius: 2, handZoomSize: 100 },
    large: { width: 400, height: 400, lineWidth: 2.5, pointRadius: 4, handPointRadius: 2.5, handZoomSize: 120 },
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

    // Detect dark mode
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

    // Compute bounding box and transform coordinates
    const computeTransform = useCallback((frame: SignFrame) => {
        // Collect all valid coordinates
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

        // Find bounding box
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

        // Scale to fit canvas with padding
        const padding = 0.1;
        const availableWidth = config.width * (1 - 2 * padding);
        const availableHeight = config.height * (1 - 2 * padding);
        const scale = Math.min(availableWidth / dataWidth, availableHeight / dataHeight);

        return { scale, dataCenterX, dataCenterY };
    }, [config.width, config.height]);

    // Store current transform
    const transformRef = useRef({ scale: 1, dataCenterX: 0.5, dataCenterY: 0.5 });

    // Transform coordinates from normalized [0,1] to canvas space
    const transformCoord = useCallback((coord: Coordinate): [number, number] | null => {
        if (!coord) return null;
        const [x, y] = coord;
        if (isNaN(x) || isNaN(y)) return null;

        const { scale, dataCenterX, dataCenterY } = transformRef.current;
        const canvasCenterX = config.width / 2;
        const canvasCenterY = config.height / 2;

        // Center and scale, flip x for mirror view
        return [
            canvasCenterX - (x - dataCenterX) * scale,
            canvasCenterY + (y - dataCenterY) * scale
        ];
    }, [config.width, config.height]);

    // Draw a line between two points
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

    // Draw a point
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

    // Draw pose skeleton
    const drawPose = useCallback((
        ctx: CanvasRenderingContext2D,
        pose: Coordinate[],
        leftHand: Coordinate[] | null,
        rightHand: Coordinate[] | null
    ) => {
        // Draw connections
        for (const [i, j] of POSE_CONNECTIONS) {
            const p1 = transformCoord(pose[i]);
            const p2 = transformCoord(pose[j]);
            drawLine(ctx, p1, p2, COLORS.body);
        }

        // Connect pose wrists to hand wrists for continuity
        if (leftHand && leftHand[0]) {
            const poseWrist = transformCoord(pose[15]); // left wrist
            const handWrist = transformCoord(leftHand[0]);
            drawLine(ctx, poseWrist, handWrist, COLORS.leftHand);
        }
        if (rightHand && rightHand[0]) {
            const poseWrist = transformCoord(pose[16]); // right wrist
            const handWrist = transformCoord(rightHand[0]);
            drawLine(ctx, poseWrist, handWrist, COLORS.rightHand);
        }

        // Draw points (only upper body) - smaller for cleaner look
        for (const i of UPPER_BODY_INDICES) {
            const point = transformCoord(pose[i]);
            // Shoulders and hips slightly larger
            const isMainJoint = [11, 12, 23, 24].includes(i);
            drawPoint(ctx, point, COLORS.body, isMainJoint ? config.pointRadius : config.pointRadius * 0.7);
        }
    }, [transformCoord, drawLine, drawPoint, config.pointRadius]);

    // Draw hand with smaller points for clearer finger definition
    const drawHand = useCallback((
        ctx: CanvasRenderingContext2D,
        hand: Coordinate[],
        color: string
    ) => {
        // Draw connections with thinner lines for fingers
        for (const [i, j] of HAND_CONNECTIONS) {
            const p1 = transformCoord(hand[i]);
            const p2 = transformCoord(hand[j]);
            if (p1 && p2) {
                ctx.beginPath();
                ctx.moveTo(p1[0], p1[1]);
                ctx.lineTo(p2[0], p2[1]);
                ctx.strokeStyle = color;
                // Thinner lines for finger bones
                const isFingerConnection = i > 0 || j > 0;
                ctx.lineWidth = isFingerConnection ? config.lineWidth * 0.7 : config.lineWidth;
                ctx.lineCap = 'round';
                ctx.stroke();
            }
        }

        // Draw points - smaller for joints, slightly larger for fingertips
        for (let i = 0; i < hand.length; i++) {
            const point = transformCoord(hand[i]);
            if (point) {
                const isFingertip = [4, 8, 12, 16, 20].includes(i);
                const isWrist = i === 0;
                let radius = config.handPointRadius;
                if (isFingertip) radius = config.handPointRadius * 1.3;
                if (isWrist) radius = config.handPointRadius * 1.5;
                drawPoint(ctx, point, color, radius);
            }
        }
    }, [transformCoord, drawPoint, config.lineWidth, config.handPointRadius]);

    // Estimate head position from shoulders when face not detected
    const estimateHeadFromPose = useCallback((pose: Coordinate[]): { centerX: number; centerY: number; radiusX: number; radiusY: number } | null => {
        // Need shoulders (11, 12) to estimate head position
        const leftShoulder = pose[11] ? transformCoord(pose[11]) : null;
        const rightShoulder = pose[12] ? transformCoord(pose[12]) : null;

        if (!leftShoulder || !rightShoulder) return null;

        // Head is centered between shoulders, above them
        const shoulderCenterX = (leftShoulder[0] + rightShoulder[0]) / 2;
        const shoulderCenterY = (leftShoulder[1] + rightShoulder[1]) / 2;
        const shoulderWidth = Math.abs(rightShoulder[0] - leftShoulder[0]);

        // Estimate head size based on shoulder width (head is roughly 1/2 shoulder width)
        const headWidth = shoulderWidth * 0.5;
        const headHeight = headWidth * 1.3; // Head is taller than wide

        // Head center is above shoulders by roughly head height
        const headCenterY = shoulderCenterY - headHeight * 1.2;

        return {
            centerX: shoulderCenterX,
            centerY: headCenterY,
            radiusX: headWidth / 2,
            radiusY: headHeight / 2
        };
    }, [transformCoord]);

    // Draw face with head outline and facial features
    const drawFace = useCallback((
        ctx: CanvasRenderingContext2D,
        face: Coordinate[],
        pose?: Coordinate[]
    ) => {
        // Collect valid face points to compute head bounds
        const validPoints: [number, number][] = [];
        for (let i = 0; i < face.length; i++) {
            if (face[i]) {
                const p = transformCoord(face[i]);
                if (p) validPoints.push(p);
            }
        }

        let headBounds: { centerX: number; centerY: number; radiusX: number; radiusY: number } | null = null;

        if (validPoints.length >= 5) {
            // Compute face bounding box for head oval
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            for (const [x, y] of validPoints) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }

            headBounds = {
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                radiusX: (maxX - minX) / 2 * 1.3,
                radiusY: (maxY - minY) / 2 * 1.4
            };
        } else if (pose) {
            // Estimate head from shoulders when face not detected
            headBounds = estimateHeadFromPose(pose);
        }

        if (!headBounds) return;

        // Draw head oval
        ctx.beginPath();
        ctx.ellipse(headBounds.centerX, headBounds.centerY, headBounds.radiusX, headBounds.radiusY, 0, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.face;
        ctx.lineWidth = config.lineWidth * 0.6;
        ctx.stroke();

        // Draw simple face features when no landmarks detected
        if (validPoints.length < 5) {
            // Draw simple eyes
            const eyeY = headBounds.centerY - headBounds.radiusY * 0.15;
            const eyeSpacing = headBounds.radiusX * 0.5;
            const eyeRadius = headBounds.radiusX * 0.12;

            // Left eye
            ctx.beginPath();
            ctx.ellipse(headBounds.centerX - eyeSpacing, eyeY, eyeRadius, eyeRadius * 0.6, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Right eye
            ctx.beginPath();
            ctx.ellipse(headBounds.centerX + eyeSpacing, eyeY, eyeRadius, eyeRadius * 0.6, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Draw simple mouth
            const mouthY = headBounds.centerY + headBounds.radiusY * 0.4;
            const mouthWidth = headBounds.radiusX * 0.5;
            ctx.beginPath();
            ctx.moveTo(headBounds.centerX - mouthWidth, mouthY);
            ctx.lineTo(headBounds.centerX + mouthWidth, mouthY);
            ctx.stroke();

            // Draw nose hint
            ctx.beginPath();
            ctx.moveTo(headBounds.centerX, headBounds.centerY - headBounds.radiusY * 0.1);
            ctx.lineTo(headBounds.centerX, headBounds.centerY + headBounds.radiusY * 0.15);
            ctx.stroke();

            return;
        }

        // Draw facial feature connections when we have landmarks
        ctx.lineWidth = config.lineWidth * 0.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const [i, j] of FACE_CONNECTIONS) {
            if (i < face.length && j < face.length && face[i] && face[j]) {
                const p1 = transformCoord(face[i]);
                const p2 = transformCoord(face[j]);
                if (p1 && p2) {
                    ctx.beginPath();
                    ctx.moveTo(p1[0], p1[1]);
                    ctx.lineTo(p2[0], p2[1]);
                    ctx.stroke();
                }
            }
        }
    }, [transformCoord, config.lineWidth, estimateHeadFromPose]);

    // Render zoomed hand view
    const renderHandZoom = useCallback((hand: Coordinate[], color: string, label: string) => {
        const canvas = handCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = handZoomSize;

        // Clear canvas
        ctx.fillStyle = isDarkMode ? COLORS.background : COLORS.backgroundLight;
        ctx.fillRect(0, 0, size, size);

        // Collect valid hand points (non-null coordinates)
        const validPoints: { idx: number; coord: [number, number, number] }[] = [];
        for (let i = 0; i < hand.length; i++) {
            const c = hand[i];
            if (c) validPoints.push({ idx: i, coord: c });
        }

        if (validPoints.length < 5) {
            // Draw "no hand" indicator
            ctx.fillStyle = '#999';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No hand', size / 2, size / 2);
            return;
        }

        // Compute hand bounding box
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

        // Scale to fit with padding
        const padding = 0.15;
        const availableSize = size * (1 - 2 * padding);
        const scale = Math.min(availableSize / dataWidth, availableSize / dataHeight);
        const canvasCenter = size / 2;

        // Transform function for hand zoom
        const transform = (coord: Coordinate): [number, number] | null => {
            if (!coord) return null;
            return [
                canvasCenter - (coord[0] - dataCenterX) * scale, // Mirror X
                canvasCenter + (coord[1] - dataCenterY) * scale
            ];
        };

        // Draw connections
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

        // Draw points
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

        // Draw label
        ctx.fillStyle = color;
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, size / 2, size - 4);
    }, [handZoomSize, isDarkMode]);

    // Render a single frame
    const renderFrame = useCallback((frame: SignFrame) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Compute transform to center and scale the figure
        transformRef.current = computeTransform(frame);

        // Clear canvas
        ctx.fillStyle = isDarkMode ? COLORS.background : COLORS.backgroundLight;
        ctx.fillRect(0, 0, config.width, config.height);

        // Draw components in order: pose, face, hands (hands on top)
        if (frame.pose) drawPose(ctx, frame.pose, frame.left_hand, frame.right_hand);
        // Draw face (pass pose for estimation when face not detected)
        drawFace(ctx, frame.face || [], frame.pose || undefined);
        if (frame.left_hand) drawHand(ctx, frame.left_hand, COLORS.leftHand);
        if (frame.right_hand) drawHand(ctx, frame.right_hand, COLORS.rightHand);

        // Render hand zoom (prefer right hand, fall back to left)
        if (frame.right_hand) {
            renderHandZoom(frame.right_hand, COLORS.rightHand, 'Right Hand');
        } else if (frame.left_hand) {
            renderHandZoom(frame.left_hand, COLORS.leftHand, 'Left Hand');
        }
    }, [config.width, config.height, isDarkMode, computeTransform, drawPose, drawFace, drawHand, renderHandZoom]);

    // Animation loop
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
                    return 0; // Loop back to start
                }
                onFrameChange?.(nextFrame);
                return nextFrame;
            });
        }

        animationRef.current = requestAnimationFrame(animate);
    }, [signData, isPlaying, playbackSpeed, onAnimationEnd, onFrameChange]);

    // Start/stop animation
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

    // Render current frame whenever it changes
    useEffect(() => {
        if (signData && signData.frames[currentFrame]) {
            renderFrame(signData.frames[currentFrame]);
        }
    }, [signData, currentFrame, renderFrame]);

    // Initial render
    useEffect(() => {
        if (signData && signData.frames[0]) {
            renderFrame(signData.frames[0]);
        }
    }, [signData, renderFrame]);

    // Reset frame when sign changes
    useEffect(() => {
        setCurrentFrame(0);
    }, [signData?.sign]);

    if (!signData) {
        return (
            <div className={`sign-animator sign-animator--${size}`}>
                <div className="sign-animator__placeholder">
                    Press Play to View
                </div>
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
                <div className="sign-animator__hand-zoom">
                    <canvas
                        ref={handCanvasRef}
                        width={handZoomSize}
                        height={handZoomSize}
                        className="sign-animator__hand-canvas"
                        aria-label="Zoomed view of hand"
                    />
                </div>
            </div>
            <div className="sign-animator__info">
                <span className="sign-animator__frame">
                    Frame {currentFrame + 1} / {signData.frame_count}
                </span>
            </div>
        </div>
    );
};

export default SignAnimator;
