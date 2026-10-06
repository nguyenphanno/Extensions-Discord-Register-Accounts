import '../styles/Entry.css';
import { createRoot } from 'react-dom/client';
import { PanelApp } from './PanelApp';

const container = document.getElementById('root');
if (!container) throw new Error('Panel root element is missing from Panel.html.');

createRoot(container).render(<PanelApp />);
