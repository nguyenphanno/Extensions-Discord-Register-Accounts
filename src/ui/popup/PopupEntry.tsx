import '../styles/Entry.css';
import { createRoot } from 'react-dom/client';
import { PopupApp } from './PopupApp';

const container = document.getElementById('root');
if (!container) throw new Error('Popup root element is missing from Popup.html.');

createRoot(container).render(<PopupApp />);
