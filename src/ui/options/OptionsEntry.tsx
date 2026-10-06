import '../styles/Entry.css';
import { createRoot } from 'react-dom/client';
import { OptionsApp } from './OptionsApp';

const container = document.getElementById('root');
if (!container) throw new Error('Options root element is missing from Options.html.');

createRoot(container).render(<OptionsApp />);
