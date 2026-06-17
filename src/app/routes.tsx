import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import HomePage from './pages/HomePage';
import PlayerRegistrationPage from './pages/PlayerRegistrationPage';
import VideoAnalysisPage from './pages/VideoAnalysisPage';
import AiVideoAnalysisPage from './pages/AiVideoAnalysisPage';
import MobileCapturePage from './pages/MobileCapturePage';
import VideoAnalysisPageLab from './pages/VideoAnalysisPageLab';
import AiVideoAnalysisPageLab from './pages/AiVideoAnalysisPageLab';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/player-registration',
    element: <PlayerRegistrationPage />,
  },
  {
    path: '/video-analysis',
    element: <VideoAnalysisPage />,
  },
  {
    path: '/ai-video-analysis',
    element: <AiVideoAnalysisPage />,
  },
  {
    path: '/video-analysis-lab',
    element: <VideoAnalysisPageLab />,
  },
  {
    path: '/ai-video-analysis-lab',
    element: <AiVideoAnalysisPageLab />,
  },
  {
    path: '/mobile-capture',
    element: <MobileCapturePage />,
  },
  {
    path: '/capture',
    element: <Navigate to="/mobile-capture" replace />,
  },
  {
    path: '/highlight',
    element: <Navigate to="/video-analysis" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
