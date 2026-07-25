export default function LoginPage({ password, setPassword, onLogin, error, loading, brandName = 'Admin Panel' }) {
  return (
    <main className="login-screen">
      <div className="mesh" />
      <form className="login-card" onSubmit={onLogin}>
        <h1>{brandName} Control</h1>
        <p>Secure admin access for inventory, billing, and order operation.</p>
        <label>Password Panel</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        />
        {error ? <div className="error">{error}</div> : null}
        <button disabled={loading}>{loading ? 'Memproses...' : 'Masuk'}</button>
      </form>
    </main>
  );
}
