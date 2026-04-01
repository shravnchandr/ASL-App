/**
 * App Component - Router setup for ASL Guide
 */

import { lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { DictionaryPage } from './components/DictionaryPage';

const LearnPage = lazy(() => import('./components/learn/LearnPage').then(m => ({ default: m.LearnPage })));
const CameraPage = lazy(() => import('./components/camera/CameraPage'));
const Admin = lazy(() => import('./components/Admin').then(m => ({ default: m.Admin })));

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/admin" element={<Admin />} />
                <Route element={<Layout />}>
                    <Route index element={<DictionaryPage />} />
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
