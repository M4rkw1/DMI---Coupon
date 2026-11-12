import PlayerAccount, { usePlayerAccount } from '../components/PlayerAccount';
export default function AccountPage() {
  const account = usePlayerAccount();
  return <div className="playerApp"><main className="playerMain"><PlayerAccount account={account} /></main></div>;
}
