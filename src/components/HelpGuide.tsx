import { useState } from 'react';
import { X, Briefcase, Palette, CheckCircle2, ArrowRight } from 'lucide-react';

interface HelpGuideProps {
  onClose: () => void;
}

// Simple step-by-step guide, shown automatically on first visit and any time
// via the "How it works" button in the header.
export default function HelpGuide({ onClose }: HelpGuideProps) {
  const [tab, setTab] = useState<'team' | 'vendor'>('team');

  const teamSteps = [
    { title: 'Create a request', text: 'Click "New Request", give it a name, pick the vendor and a due date. Sizes and design rules are filled in for you — edit them if you need to.' },
    { title: 'The vendor gets to work', text: 'The assigned vendor sees the request instantly with all the details. You can watch its progress move across the board.' },
    { title: 'Review what they send', text: 'When a design arrives, the card shows "Ready for review". Click it to see the design and the conversation.' },
    { title: 'Approve or ask for changes', text: 'One click to approve, or write what needs fixing and send it back. The vendor sees your feedback immediately.' },
  ];

  const vendorSteps = [
    { title: 'Accept a new request', text: 'New work appears under "New requests". Open it to read the sizes, brand rules and due date, then press "Accept & Start".' },
    { title: 'Do the work', text: 'Create the design in your own tools, then upload it to your OneDrive / Drive and copy the share link.' },
    { title: 'Send your design', text: 'Open the request, click "Send your design", paste the link and a file name. The client is notified instantly.' },
    { title: 'Handle feedback', text: 'If changes are requested, the request moves to "Changes requested" with the client\'s notes. Send a new version the same way — versions are tracked automatically.' },
  ];

  const steps = tab === 'team' ? teamSteps : vendorSteps;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-slide-in">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex justify-between items-start">
          <div>
            <h2 className="font-sans font-bold text-lg text-slate-900">How it works</h2>
            <p className="text-sm text-slate-500 mt-0.5">Four steps — that's the whole app.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
            aria-label="Close guide"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-2">
          <button
            onClick={() => setTab('team')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              tab === 'team' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Briefcase className="h-4 w-4" />
            I'm on the team
          </button>
          <button
            onClick={() => setTab('vendor')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              tab === 'vendor' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Palette className="h-4 w-4" />
            I'm a vendor
          </button>
        </div>

        {/* Steps */}
        <div className="px-6 py-5 space-y-4">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-slate-900 text-white text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div>
                <div className="font-semibold text-sm text-slate-900">{step.title}</div>
                <p className="text-sm text-slate-600 leading-relaxed mt-0.5">{step.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <CheckCircle2 className="h-4 w-4" />
            Got it — let's go
          </button>
          <p className="text-xs text-center text-slate-400 mt-3">
            You can reopen this any time with the "How it works" button at the top.
          </p>
        </div>
      </div>
    </div>
  );
}
