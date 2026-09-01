'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { NewFeaturesBanner } from '@/components/admin/NewFeaturesBanner';
import { countRsvpPeople } from '@/lib/rsvpCounts';
import { countMealChoices } from '@/lib/rsvpMeals';

interface Guest {
  id: string;
  name: string;
}

interface RsvpResponse {
  attending: string;
  guestCount: number;
  guestMeals: string | null;
  attendingGuests: string | null;
  plusOnes: string | null; // JSON: [{ name, meal }]
  plusOneName?: string | null; // legacy single plus-one column
  plusOneMeal?: string | null;
}

interface Invitation {
  id: string;
  householdName: string;
  guests: Guest[];
  plusOnesAllowed: number;
  response: RsvpResponse | null | undefined;
}

export default function AdminDashboard() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/invitations')
      .then((res) => (res.ok ? res.json() : []))
      .then(setInvitations)
      .catch(() => setInvitations([]))
      .finally(() => setLoading(false));
  }, []);

  const totalInvitations = invitations.length;
  // Counts every possible attendee — named guests plus any plus-one slots the
  // invitation allows. Matches the semantics of the "Attending" card's guest
  // count, which also includes actualized plus-ones.
  const totalGuests = invitations.reduce(
    (sum, inv) => sum + inv.guests.length + (inv.plusOnesAllowed || 0),
    0,
  );
  const responded = invitations.filter((inv) => inv.response);
  const attending = responded.filter((inv) => inv.response?.attending === 'yes');
  const declining = responded.filter((inv) => inv.response?.attending === 'no');
  const pending = invitations.filter((inv) => !inv.response);
  // Same people-count logic as the RSVPs page (roster / numeric / legacy plus-ones).
  const peopleCounts = invitations.map((inv) => countRsvpPeople(inv));
  const totalAttendingGuests = peopleCounts.reduce((sum, c) => sum + c.attending, 0);
  const totalDeclinedGuests = peopleCounts.reduce((sum, c) => sum + c.declined, 0);
  // Pending households contribute 0/0 from countRsvpPeople; their people are
  // the invitation's potential capacity (named guests + plus-one slots).
  const pendingGuests = pending.reduce(
    (sum, inv) => sum + inv.guests.length + (inv.plusOnesAllowed || 0),
    0,
  );
  // Segment sum for the Guest Status bars — not totalGuests capacity, since
  // stale attending IDs and numeric-mode edge cases can make the three people
  // segments not equal capacity.
  const guestStatusTotal = totalAttendingGuests + totalDeclinedGuests + pendingGuests;

  const mealCounts = countMealChoices(invitations);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <NewFeaturesBanner />
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Total Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalInvitations}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Total Guests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalGuests}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Attending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{attending.length}</p>
            <p className="text-sm text-gray-500">{totalAttendingGuests} guests</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-500">Declined</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{declining.length}</p>
            <p className="text-sm text-gray-500">{totalDeclinedGuests} guests</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Response Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Attending</span>
                <span className="font-semibold text-green-600">{attending.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{
                    width: totalInvitations
                      ? `${(attending.length / totalInvitations) * 100}%`
                      : '0%',
                  }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Declined</span>
                <span className="font-semibold text-red-600">{declining.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-red-600 h-2 rounded-full"
                  style={{
                    width: totalInvitations
                      ? `${(declining.length / totalInvitations) * 100}%`
                      : '0%',
                  }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Pending</span>
                <span className="font-semibold text-yellow-600">{pending.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-600 h-2 rounded-full"
                  style={{
                    width: totalInvitations
                      ? `${(pending.length / totalInvitations) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Guest Status</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Bar denominator is the segment sum (not totalGuests capacity) so
                bars always total 100% even when stale IDs / numeric edge cases
                make people segments disagree with invitation capacity. */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">Attending</span>
                <span className="font-semibold text-green-600">{totalAttendingGuests}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-600 h-2 rounded-full"
                  style={{
                    width: guestStatusTotal
                      ? `${(totalAttendingGuests / guestStatusTotal) * 100}%`
                      : '0%',
                  }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Declined</span>
                <span className="font-semibold text-red-600">{totalDeclinedGuests}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-red-600 h-2 rounded-full"
                  style={{
                    width: guestStatusTotal
                      ? `${(totalDeclinedGuests / guestStatusTotal) * 100}%`
                      : '0%',
                  }}
                />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Pending</span>
                <span className="font-semibold text-yellow-600">{pendingGuests}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-yellow-600 h-2 rounded-full"
                  style={{
                    width: guestStatusTotal
                      ? `${(pendingGuests / guestStatusTotal) * 100}%`
                      : '0%',
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meal Choices</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(mealCounts).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(mealCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([meal, count]) => (
                    <div key={meal} className="flex justify-between items-center">
                      <span className="text-sm capitalize">{meal}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No meal selections yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
