import Link from 'next/link';
export default function NotFound(){return <div className="container dashboard"><h1>Page not found</h1><p className="muted">This page is unavailable or you do not have access.</p><Link className="btn" href="/dashboard">Back to dashboard</Link></div>}
