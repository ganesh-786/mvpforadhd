import { useState } from 'react';

const DURATION_PRESETS = [15, 25, 45, 90];
const DAYS = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
];
const ENERGY_BUCKETS = [
  ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'],
];
const ENERGY_LEVELS = ['low', 'medium', 'high'];

function toggleDay(workingHours, day) {
  const next = { ...workingHours };
  if (next[day]?.length) {
    next[day] = [];
  } else {
    next[day] = [['09:00', '17:00']];
  }
  return next;
}

function setDayRange(workingHours, day, idx, field, value) {
  const next = { ...workingHours };
  const ranges = (next[day] || []).map((r) => [...r]);
  ranges[idx][field === 'start' ? 0 : 1] = value;
  next[day] = ranges;
  return next;
}

/* Shared by onboarding (first-run) and settings (revisit). Reads/writes the
   plain preferences shape the server expects: { focusSessionMinutes,
   workingHours, energyPattern }. */
export default function PreferencesForm({ initial, onSave, saveLabel = 'Save' }) {
  const [focusMinutes, setFocusMinutes] = useState(initial?.focus_session_minutes ?? 25);
  const [customMinutes, setCustomMinutes] = useState('');
  const [workingHours, setWorkingHours] = useState(initial?.working_hours ?? {});
  const [energyPattern, setEnergyPattern] = useState(initial?.energy_pattern ?? { morning: 'high', afternoon: 'medium', evening: 'low' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isPreset = DURATION_PRESETS.includes(focusMinutes);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ focusSessionMinutes: focusMinutes, workingHours, energyPattern });
    } catch (err) {
      setError(err.message || 'Could not save preferences.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', maxWidth: 420 }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#7C8C85' }}>How long can you usually focus in one go?</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DURATION_PRESETS.map((mins) => (
            <button
              key={mins}
              type="button"
              onClick={() => { setFocusMinutes(mins); setCustomMinutes(''); }}
              style={{
                borderRadius: 999, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 44,
                border: `1px solid ${focusMinutes === mins ? '#3D7A68' : '#D7E2DC'}`,
                background: focusMinutes === mins ? '#DCEBE3' : '#FFFFFF',
                color: focusMinutes === mins ? '#2C5A4C' : '#7C8C85',
              }}
            >
              {mins} min
            </button>
          ))}
          <input
            type="number"
            min={5}
            max={240}
            placeholder="Custom"
            value={!isPreset ? focusMinutes : customMinutes}
            onChange={(e) => {
              const val = Number(e.target.value) || 0;
              setCustomMinutes(e.target.value);
              if (val > 0) setFocusMinutes(val);
            }}
            style={{ width: 90, border: '1px solid #D7E2DC', borderRadius: 999, padding: '9px 14px', fontSize: 13.5 }}
          />
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#7C8C85' }}>Which days do you want to work, and when?</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DAYS.map(([key, label]) => {
            const ranges = workingHours[key] || [];
            const active = ranges.length > 0;
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FFFFFF', borderRadius: 12, padding: '10px 12px', border: '1px solid #EFF3F0' }}>
                <button
                  type="button"
                  onClick={() => setWorkingHours((wh) => toggleDay(wh, key))}
                  style={{
                    width: 44, minHeight: 32, borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                    background: active ? '#3D7A68' : '#EFF3F0', color: active ? '#fff' : '#7C8C85',
                  }}
                >
                  {label}
                </button>
                {active && ranges.map((range, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="time"
                      value={range[0]}
                      onChange={(e) => setWorkingHours((wh) => setDayRange(wh, key, idx, 'start', e.target.value))}
                      style={{ border: '1px solid #D7E2DC', borderRadius: 8, padding: '4px 6px', fontSize: 12.5 }}
                    />
                    <span style={{ color: '#7C8C85', fontSize: 12 }}>to</span>
                    <input
                      type="time"
                      value={range[1]}
                      onChange={(e) => setWorkingHours((wh) => setDayRange(wh, key, idx, 'end', e.target.value))}
                      style={{ border: '1px solid #D7E2DC', borderRadius: 8, padding: '4px 6px', fontSize: 12.5 }}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#7C8C85' }}>When's your energy usually highest?</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ENERGY_BUCKETS.map(([key, label]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF', borderRadius: 12, padding: '10px 12px', border: '1px solid #EFF3F0' }}>
              <span style={{ fontSize: 13.5, color: '#2A3330' }}>{label}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {ENERGY_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setEnergyPattern((ep) => ({ ...ep, [key]: level }))}
                    style={{
                      borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 32,
                      border: `1px solid ${energyPattern[key] === level ? '#3D7A68' : '#D7E2DC'}`,
                      background: energyPattern[key] === level ? '#DCEBE3' : '#FFFFFF',
                      color: energyPattern[key] === level ? '#2C5A4C' : '#7C8C85',
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <div style={{ fontSize: 13, color: '#C0392B' }}>{error}</div>}

      <button
        type="submit"
        disabled={saving}
        style={{ background: '#3D7A68', color: '#fff', border: 'none', borderRadius: 12, padding: 14, fontWeight: 600, fontSize: 15, cursor: 'pointer', minHeight: 48 }}
      >
        {saving ? 'Saving…' : saveLabel}
      </button>
    </form>
  );
}
