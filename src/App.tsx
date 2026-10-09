/**
 * App Component - Router setup for ASL Guide
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DictionaryPage } from './components/DictionaryPage';
import HomePage from './components/HomePage';
import { OnboardingPage } from './components/OnboardingPage';

const LearnPage = lazy(() => import('./components/learn/LearnPage').then(m => ({ default: m.LearnPage })));
const CameraPage = lazy(() => import('./components/camera/CameraPage'));
const Admin = lazy(() => import('./components/Admin').then(m => ({ default: m.Admin })));
const SignBrowserPage = lazy(() => import('./components/SignBrowserPage'));

/** Older share links pointed at /?q=…; send them to the translation page. */
function HomeOrLegacyShare() {
    const [searchParams] = useSearchParams();
    if (searchParams.get('q')) {
        return <Navigate to={`/translate?${searchParams.toString()}`} replace />;
    }
    return <HomePage />;
}

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/admin" element={
                    <Suspense fallback={null}>
                        <Admin />
                    </Suspense>
                } />
                <Route element={<Layout />}>
                    <Route index element={<HomeOrLegacyShare />} />
                    <Route path="translate" element={<DictionaryPage />} />
                    <Route path="dictionary" element={<SignBrowserPage />} />
                    <Route path="signs" element={<SignBrowserPage />} />
                    <Route path="learn" element={<LearnPage />} />
                    <Route path="camera" element={<CameraPage />} />
                    <Route path="onboarding" element={<OnboardingPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
