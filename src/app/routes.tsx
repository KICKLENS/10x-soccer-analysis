import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import HomePage from './pages/HomePage';
import PlayerRegistrationPage from './pages/PlayerRegistrationPage';
import VideoAnalysisPage from './pages/VideoAnalysisPage';
import AiVideoAnalysisPage from './pages/AiVideoAnalysisPage';
import MobileCapturePage from './pages/MobileCapturePage';
import AnalysisHistoryPage from './pages/AnalysisHistoryPage';
import TrainingJournalPage from './pages/TrainingJournalPage';
import VideoAnalysisPageLab from './pages/VideoAnalysisPageLab';
import AiVideoAnalysisPageLab from './pages/AiVideoAnalysisPageLab';
import HighlightExtractionPage from './pages/HighlightExtractionPage';
import ClubMatchAnalysisPage from './pages/ClubMatchAnalysisPage';
import ClubPage from './pages/ClubPage';
import ClubGradePage from './pages/ClubGradePage';
import ClubPlayerPage from './pages/ClubPlayerPage';

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
    path: '/analysis-history',
    element: <AnalysisHistoryPage />,
  },
  {
    path: '/training-journal',
    element: <TrainingJournalPage />,
  },
  {
    path: '/highlight-extraction',
    element: <HighlightExtractionPage />,
  },
  {
    path: '/club/match-analysis',
    element: <ClubMatchAnalysisPage />,
  },
  {
    path: '/club',
    element: <ClubPage />,
  },
  {
    path: '/club/grade/:grade',
    element: <ClubGradePage />,
  },
  {
    path: '/club/player/:id',
    element: <ClubPlayerPage />,
  },
  {
    path: '/capture',
    element: <Navigate to="/mobile-capture" replace />,
  },
  {
    path: '/highlight',
    element: <Navigate to="/highlight-extraction" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
