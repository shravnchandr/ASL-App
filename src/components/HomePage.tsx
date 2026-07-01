import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { SignAnimator } from './learn/SignAnimator';
import { storage } from '../utils/storage';
import { loadSignData } from '../utils/signDataLoader';
import { formatSignName } from '../utils/format';
import { LEVELS } from '../constants/levels';
import type { SignData } from '../types';
import './HomePage.css';

const USER_NAME = 'Alex';

function getGreeting(): string {
    const h = new Date().getHours();
    if (h < 12) return `Good morning, ${USER_NAME}.`;
    if (h < 17) return `Good afternoon, ${USER_NAME}.`;
    return `Good evening, ${USER_NAME}.`;
}

function getDateLine(pickupCount: number): string {
    const d = new Date();
    const day = d.toLocaleDateString('en-US', { weekday: 'long' });
    const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    return `${day}, ${date} · pickup #${pickupCount}`;
}

function getSubtitle(reviewDue: number, totalLearned: number): string {
    if (totalLearned === 0) return 'Start learning ASL today.';
    if (reviewDue > 0) return `${reviewDue} sign${reviewDue !== 1 ? 's' : ''} picked up from yesterday.`;
    return 'All caught up — keep the streak going.';
}

function getLevelMastery(levelId: number): number {
    const level = LEVELS.find(l => l.id === levelId);
    if (!level) return 0;
    const progress = storage.getLearningProgress();
    const masteries = level.signs.map(s => progress[s]?.mastery ?? 0);
    if (masteries.length === 0) return 0;
    return Math.round(masteries.reduce((a, b) => a + b, 0) / masteries.length);
}

function getTotalSignsLearned(): number {
    const progress = storage.getLearningProgress();
    return Object.values(progress).filter(p => p.mastery > 0).length;
}

const SOTD_ALSO_SEEN: Record<string, string[]> = {
    good: ['good morning', 'good night', 'good job', 'so good'],
    hello: ['hi', 'good morning', 'hey'],
    thank_you: ['please', 'sorry', "you're welcome"],
    happy: ['so happy', 'happiness'],
    sorry: ['excuse me', 'apologize'],
    morning: ['good morning', 'this morning', 'every morning'],
    how: ['how are you', 'how much', 'how many'],
};

const SOTD_DESCRIPTIONS: Record<string, string> = {
    good: 'Flat hand at the chin, falls onto the other palm — one soft motion, like setting something down with care. In ASL the same shape doubles as thank you when it moves outward instead.',
    hello: 'Open hand at the temple, sweeps outward — like a casual salute. Natural and relaxed.',
    thank_you: 'Flat hand touches chin, then moves forward and down toward the other person.',
    morning: 'Bent arm rises from waist level, hand open, like the sun coming up over the horizon.',
};

const SIGN_SHORT_DESCRIPTIONS: Record<string, string> = {
    a: 'fist, thumb to side', b: 'flat hand, thumb tucked', c: 'curved hand', d: 'index up, fingers curve',
    e: 'fingers curl to thumb', f: 'index-thumb circle', g: 'index and thumb point out',
    h: 'two fingers point sideways', i: 'pinky up', j: 'pinky traces a J',
    k: 'index and middle up, thumb between', l: 'L shape', m: 'three fingers over thumb',
    n: 'two fingers over thumb', o: 'all fingers curve to thumb', p: 'K shape, pointing down',
    q: 'G shape, pointing down', r: 'crossed fingers', s: 'fist, thumb over fingers',
    t: 'thumb between index and middle', u: 'two fingers together up', v: 'two fingers spread',
    w: 'three fingers up spread', x: 'index hooked', y: 'thumb and pinky out', z: 'index traces a Z',
    one: 'index finger up', two: 'index and middle up', three: 'thumb, index, middle up',
    four: 'four fingers up, thumb down', five: 'all five fingers spread',
    six: 'pinky and thumb touch', seven: 'ring and thumb touch', eight: 'middle and thumb touch',
    nine: 'index and thumb circle', ten: 'thumb up, wiggle hand',
    hello: 'open hand sweeps from temple', goodbye: 'wave away from body',
    please: 'flat hand circles on chest', thank_you: 'flat hand from chin out',
    sorry: 'fist circles on chest', yes: 'fist bobs like a nod', no: 'index and middle snap to thumb',
    good: 'flat hand at chin, falls to palm', bad: 'hand brushes down from chin',
    morning: 'hand rises like the sun', afternoon: 'forearm tilts forward',
    night: 'bent hand arcs down like sunset', today: 'both hands drop down together',
    tomorrow: 'thumb moves forward from chin', yesterday: 'thumb arcs back over shoulder',
    now: 'both hands drop straight down', later: 'L hand tilts forward',
    mother: 'thumb taps chin', father: 'thumb taps forehead',
    family: 'F hands circle out and meet', friend: 'index fingers link both ways',
    happy: 'hands brush up the chest', sad: 'hands pull down the face',
    angry: 'clawed hand pulls from face', scared: 'hands spring open at chest',
    love: 'cross arms over chest', want: 'clawed hands pull toward body',
    need: 'bent index points and bends down', help: 'thumb up lifts on open palm',
    stop: 'flat hand chops into open palm', go: 'index fingers arc forward',
    come: 'index fingers curl toward body', eat: 'fingers tap mouth',
    drink: 'thumb tilts to mouth', sleep: 'hand closes from face down',
    home: 'fingers touch mouth then cheek', school: 'clap hands twice',
    work: 'fists tap together', play: 'Y hands shake loosely',
    how: 'knuckles roll out, palms up', what: 'fingers brush through open palm',
    where: 'index wags side to side', who: 'index traces a circle at lips',
    why: 'fingers move from temple, Y shape', when: 'index circles then meets other index',
    which: 'A hands alternate up and down', sit: 'two fingers sit on other two fingers',
    stand: 'two fingers stand on open palm', walk: 'two hands alternate stepping',
    run: 'L hands, index links and pull forward', read: 'V hand scans open palm',
    write: 'fingertips scribble on palm', you: 'index point, eye contact',
    me: 'index points to chest', we: 'index sweeps from shoulder to shoulder',
    january: 'J-A-N mouthed', february: 'F-E-B mouthed', march: 'M-A-R mouthed',
    april: 'A-P-R mouthed', may: 'M-A-Y mouthed', june: 'J-U-N-E mouthed',
    july: 'J-U-L-Y mouthed', august: 'A-U-G mouthed', september: 'S-E-P-T mouthed',
    october: 'O-C-T mouthed', november: 'N-O-V mouthed', december: 'D-E-C mouthed',
    wait: 'fingers wiggle open, palms up', fine: 'five hand taps chest',
    hospital: 'H hand crosses on upper arm', police: 'C hand taps chest badge',
};

// ── Sign of the Day Card ───────────────────────────────────────────

const SignOfDayCard: React.FC<{ sotdIndex: number }> = ({ sotdIndex }) => {
    const [sign] = useState('good');
    const [data, setData] = useState<SignData | null>(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [saved, setSaved] = useState(false);
    const [currentFrame, setCurrentFrame] = useState(0);

    useEffect(() => {
        let cancelled = false;
        loadSignData('good').then(d => {
            if (!cancelled) setData(d);
        });
        return () => { cancelled = true; };
    }, []);

    const handleFrameChange = useCallback((f: number) => setCurrentFrame(f), []);

    if (!sign) return null;

    const displayName = formatSignName(sign).toLowerCase();
    const alsoSeen = SOTD_ALSO_SEEN[sign] ?? [];
    const desc = SOTD_DESCRIPTIONS[sign] ?? `A common ASL sign for "${displayName}".`;
    const totalFrames = data?.frame_count ?? 0;
    const fps = data?.fps ?? 30;
    const duration = totalFrames > 0 ? (totalFrames / fps).toFixed(1) : '0.0';

    const handleShare = () => {
        if (navigator.share) {
            navigator.share({ title: `ASL Sign: ${displayName}`, url: window.location.href });
        } else {
            navigator.clipboard.writeText(window.location.href).catch(() => {});
        }
    };

    return (
        <section className="sotd-card" aria-label="Sign of the day">
            {/* Left column */}
            <div className="sotd-card__left">
                <div className="sotd-card__eyebrow">
                    <span className="sotd-card__dot" aria-hidden="true" />
                    SIGN OF THE DAY · #{sotdIndex}
                </div>

                <div className="sotd-card__word-row">
                    <h2 className="sotd-card__word">{displayName}</h2>
                </div>
                <div className="sotd-card__attribution">adj. · <em>verified by Lifeprint</em></div>

                <p className="sotd-card__desc">{desc}</p>

                {alsoSeen.length > 0 && (
                    <p className="sotd-card__also-seen">
                        <span className="sotd-card__also-label">Also seen in:</span>
                        {alsoSeen.join(' · ')}
                    </p>
                )}

                <div className="sotd-card__actions">
                    {data && (
                        <button
                            className="sotd-card__btn sotd-card__btn--primary"
                            onClick={() => setIsPlaying(p => !p)}
                        >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                {isPlaying
                                    ? <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                    : <path d="M8 5v14l11-7z" />}
                            </svg>
                            {isPlaying ? 'Pause' : 'Practice now'}
                            {!isPlaying && <span aria-hidden="true">→</span>}
                        </button>
                    )}
                    <button
                        className={`sotd-card__btn ${saved ? 'sotd-card__btn--saved' : 'sotd-card__btn--ghost'}`}
                        onClick={() => setSaved(s => !s)}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" strokeLinejoin="round" />
                        </svg>
                        {saved ? 'Saved' : 'Save to library'}
                    </button>
                    <button className="sotd-card__btn sotd-card__btn--ghost" onClick={handleShare}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                        Share
                    </button>
                </div>
            </div>

            {/* Right column */}
            <div className="sotd-card__right">
                <div className="sotd-card__right-header">
                    <span className="sotd-card__right-label">SIGN · {displayName.toUpperCase()}</span>
                    <span className="sotd-card__right-verified">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        verified
                    </span>
                </div>

                <div className="sotd-card__anim-wrap" aria-hidden="true">
                    {data ? (
                        <SignAnimator
                            signData={data}
                            isPlaying={isPlaying}
                            playbackSpeed={0.8}
                            size="large"
                            onFrameChange={handleFrameChange}
                        />
                    ) : (
                        <div className="sotd-card__anim-placeholder" />
                    )}
                </div>

                <div className="sotd-card__right-footer">
                    <span className="sotd-card__frame-info">
                        frame {currentFrame + 1} / {totalFrames || '—'}
                    </span>
                    <span className="sotd-card__frame-info">
                        0.0 → {duration}s
                    </span>
                </div>
            </div>
        </section>
    );
};

// ── Lesson Plan Card ───────────────────────────────────────────────

const LessonPlanCard: React.FC = () => {
    const levelProgress = storage.getLevelProgress();
    const currentLevel = LEVELS.find(l => l.id === levelProgress.currentLevel) ?? LEVELS[0];
    const progress = storage.getLearningProgress();
    const mastery = getLevelMastery(currentLevel.id);
    const signs = currentLevel.signs;

    const masteredCount = signs.filter(s => (progress[s]?.mastery ?? 0) >= 70).length;
    const startedCount = signs.filter(s => {
        const m = progress[s]?.mastery ?? 0;
        return m > 0 && m < 70;
    }).length;
    void (signs.length - masteredCount - startedCount); // unused
    const signsLeft = signs.length - masteredCount;
    const xpAvailable = signsLeft * 10;
    const timeMin = Math.round(signsLeft * 0.5 + startedCount * 0.5);

    return (
        <div className="plan-card">
            {/* Header row */}
            <div className="plan-card__header">
                <div className="plan-card__header-left">
                    <div className="plan-card__eyebrow">TODAY'S LESSON PLAN · LEVEL {currentLevel.id}</div>
                    <div className="plan-card__title">{currentLevel.name} — part {masteredCount + 1} of {signs.length}</div>
                </div>
                <Link to="/learn" className="plan-card__btn">
                    Start session
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                </Link>
            </div>

            {/* Thick segment progress bar */}
            <div className="plan-card__segments" aria-label={`${mastery}% mastered`}>
                {signs.map((s, i) => {
                    const m = progress[s]?.mastery ?? 0;
                    const cls = m >= 70 ? 'plan-seg--mastered' : m > 0 ? 'plan-seg--started' : '';
                    return <div key={i} className={`plan-seg ${cls}`} />;
                })}
            </div>

            {/* Sign chips */}
            <div className="plan-card__chips">
                {signs.map(s => {
                    const m = progress[s]?.mastery ?? 0;
                    const mastered = m >= 70;
                    return (
                        <span key={s} className={`plan-chip ${mastered ? 'plan-chip--mastered' : m > 0 ? 'plan-chip--started' : ''}`}>
                            {mastered && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>}
                            {formatSignName(s).toLowerCase()}
                        </span>
                    );
                })}
            </div>

            {/* Footer row */}
            <div className="plan-card__footer">
                <span className="plan-card__footer-left">≈ {timeMin} min remaining · {signsLeft} signs left</span>
                <span className="plan-card__footer-right">+{xpAvailable} XP available</span>
            </div>
        </div>
    );
};

// ── Streak Card ────────────────────────────────────────────────────

const StreakCard: React.FC = () => {
    const stats = storage.getLearningStats();
    const streak = stats.streak;

    const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const label = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
        // Intensity: today and recent active days are darker
        const daysAgo = 6 - i;
        const isActive = daysAgo < Math.min(streak, 7);
        const intensity = isActive ? Math.min(1, (7 - daysAgo) / 7) : 0;
        return { label, isActive, intensity };
    });

    const decayHours = 24 - new Date().getHours();

    return (
        <div className="streak-card">
            <div className="streak-card__top">
                <div className="streak-card__eyebrow">YOUR STREAK</div>
                {streak > 0 && (
                    <span className="streak-card__badge">
                        <span className="streak-card__badge-dot" aria-hidden="true" />
                        active
                    </span>
                )}
            </div>
            <div className="streak-card__num">{streak} days</div>
            <div className="streak-card__sub">
                {streak > 0
                    ? `longest yet — ${decayHours}h until decay`
                    : 'Start your streak today'}
            </div>

            <div className="streak-card__cal">
                {days.map((d, i) => (
                    <div key={i} className="streak-card__cal-col">
                        <div
                            className={`streak-card__tile ${d.isActive ? 'streak-card__tile--on' : ''}`}
                            style={d.isActive ? { opacity: 0.4 + d.intensity * 0.6 } : {}}
                        />
                        <div className="streak-card__day-lbl">{d.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Stats Bar ──────────────────────────────────────────────────────

const StatsBar: React.FC = () => {
    const totalLearned = getTotalSignsLearned();
    const stats = storage.getLearningStats();
    const levelProgress = storage.getLevelProgress();
    const currentLevel = levelProgress.currentLevel;
    const totalLevels = LEVELS.length;
    const levelMastery = getLevelMastery(currentLevel);
    const savedCount = storage.getSearchHistory().length;

    return (
        <div className="stats-bar">
            <div className="stats-tile">
                <div className="stats-tile__value">{totalLearned}</div>
                <div className="stats-tile__label">signs learned</div>
                <div className="stats-tile__delta">+{Math.min(totalLearned, 6)} this week</div>
            </div>

            <div className="stats-tile">
                <div className="stats-tile__value">{String(Math.min(currentLevel, 99)).padStart(2, '0')}</div>
                <div className="stats-tile__label">of {totalLevels} levels</div>
                <div className="stats-tile__bar">
                    <div className="stats-tile__bar-fill" style={{ width: `${levelMastery}%` }} />
                </div>
                <div className="stats-tile__delta">{levelMastery}% to level {Math.min(currentLevel + 1, totalLevels)}</div>
            </div>

            <div className="stats-tile">
                <div className="stats-tile__value">{Math.round(stats.totalXP / Math.max(totalLearned, 1))}%</div>
                <div className="stats-tile__label">camera accuracy</div>
                <div className="stats-tile__delta">↑ 4% last 5</div>
            </div>

            <div className="stats-tile">
                <div className="stats-tile__value">{savedCount}</div>
                <div className="stats-tile__label">saved phrases</div>
                <Link to="/translate" className="stats-tile__link">open translations →</Link>
            </div>
        </div>
    );
};

// ── Continue Your Path ─────────────────────────────────────────────

interface ReviewSignCardProps {
    sign: string;
    isVerified?: boolean;
}

const ReviewSignCard: React.FC<ReviewSignCardProps> = ({ sign, isVerified = true }) => {
    const [data, setData] = useState<SignData | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        let cancelled = false;
        loadSignData(sign).then(d => { if (!cancelled) setData(d); });
        return () => { cancelled = true; };
    }, [sign]);

    const desc = SIGN_SHORT_DESCRIPTIONS[sign] ?? 'practice this sign';

    return (
        <div className="review-card" onClick={() => setIsPlaying(p => !p)} role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter') setIsPlaying(p => !p); }}
            aria-label={`${formatSignName(sign)}, ${desc}`}>
            <div className="review-card__anim">
                <SignAnimator signData={data} isPlaying={isPlaying} playbackSpeed={1} size="small" />
            </div>
            <div className="review-card__footer">
                <span className="review-card__name">{formatSignName(sign).toLowerCase()}</span>
                <span className={`review-card__badge ${isVerified ? '' : 'review-card__badge--ai'}`}>
                    {isVerified ? 'verified' : 'AI'}
                </span>
            </div>
            <div className="review-card__desc">{desc}</div>
        </div>
    );
};

// ── Recently Saved ─────────────────────────────────────────────────

function getRelativeDate(index: number): string {
    if (index === 0) return 'Today';
    if (index === 1) return 'Yesterday';
    return `${index + 1} days ago`;
}

const RecentlySaved: React.FC = () => {
    const history = storage.getSearchHistory();
    if (history.length === 0) return null;

    return (
        <section className="home-section">
            <div className="home-section__header">
                <div>
                    <div className="home-section__eyebrow">RECENTLY SAVED</div>
                    <h2 className="home-section__title">Phrases you've translated</h2>
                </div>
                <Link to="/translate" className="home-section__link">Open translations</Link>
            </div>

            <div className="saved-list">
                {history.slice(0, 5).map((query, i) => {
                    const cached = (() => {
                        try {
                            const raw = sessionStorage.getItem(`asl_result:${query.toLowerCase().trim()}`);
                            return raw ? JSON.parse(raw) : null;
                        } catch { return null; }
                    })();
                    const signCount = cached?.signs?.length ?? null;

                    return (
                        <Link key={i} to={`/translate?q=${encodeURIComponent(query)}`} className="saved-item">
                            <span className="saved-item__query">"{query}"</span>
                            <div className="saved-item__meta">
                                {signCount !== null && <span className="saved-item__count">{signCount} signs</span>}
                                <span className="saved-item__date">{getRelativeDate(i)}</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                                    <path d="M9 18l6-6-6-6"/>
                                </svg>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
};

// ── Main Page ──────────────────────────────────────────────────────

const HomePage: React.FC = () => {
    void storage.getLearningStats();
    const totalLearned = getTotalSignsLearned();
    const reviewSigns = storage.getSignsDueForReview().slice(0, 4);
    const pickupCount = Math.max(1, totalLearned);
    const reviewDue = reviewSigns.length;
    const subtitle = getSubtitle(reviewDue, totalLearned);

    const sotdIndex = 42;

    return (
        <div className="home-page">
            {/* Greeting */}
            <div className="home-greeting">
                <div className="home-greeting__date">{getDateLine(pickupCount)}</div>
                <h1 className="home-greeting__headline">{getGreeting()}</h1>
                <p className="home-greeting__sub">{subtitle}</p>
            </div>

            {/* Sign of the Day */}
            <SignOfDayCard sotdIndex={sotdIndex} />

            {/* Lesson plan + Streak — always visible */}
            <div className="home-mid">
                <LessonPlanCard />
                <StreakCard />
            </div>

            {/* Stats — always visible */}
            <StatsBar />

            {/* Continue Your Path */}
            {reviewSigns.length > 0 && (
                <section className="home-section">
                    <div className="home-section__header">
                        <div>
                            <div className="home-section__eyebrow">CONTINUE YOUR PATH</div>
                            <h2 className="home-section__title">Pick up where you left off</h2>
                        </div>
                        <Link to="/learn" className="home-section__link">See all queued →</Link>
                    </div>
                    <div className="review-grid">
                        {reviewSigns.map(sign => (
                            <ReviewSignCard key={sign} sign={sign} isVerified={true} />
                        ))}
                    </div>
                </section>
            )}

            {/* Recently Saved */}
            <RecentlySaved />
        </div>
    );
};

export default HomePage;
