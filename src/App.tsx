/**
 * App Component - Router setup for ASL Guide
 */

import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DictionaryPage } from './components/DictionaryPage';
import HomePage from './components/HomePage';

const LearnPage = lazy(() => import('./components/learn/LearnPage').then(m => ({ default: m.LearnPage })));
const CameraPage = lazy(() => import('./components/camera/CameraPage'));
const Admin = lazy(() => import('./components/Admin').then(m => ({ default: m.Admin })));

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
                    <Route index element={<HomePage />} />
                    <Route path="dictionary" element={<DictionaryPage />} />
                    <Route path="translate" element={<DictionaryPage />} />
                    <Route path="learn" element={<LearnPage />} />
                    <Route path="camera" element={<CameraPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
