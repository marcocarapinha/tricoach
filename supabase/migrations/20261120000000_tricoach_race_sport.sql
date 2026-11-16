-- TriCoach · provas de outros desportos (corrida, ciclismo, natação, águas abertas) com distâncias próprias
alter table public.races add column if not exists sport text not null default 'triathlon'
  check (sport in ('triathlon', 'run', 'bike', 'swim', 'open_water'));

alter table public.races drop constraint if exists races_distance_check;
alter table public.races add constraint races_distance_check check (distance in (
  'super_sprint', 'sprint', 'olympic', 'half', 'full',
  'run_5k', 'run_10k', 'run_half', 'run_marathon', 'run_trail', 'run_ultra',
  'bike_tt', 'bike_road', 'bike_granfondo', 'bike_mtb',
  'swim_100', 'swim_200', 'swim_400', 'swim_800', 'swim_1500',
  'ow_1500', 'ow_3k', 'ow_5k', 'ow_10k',
  'other'
));
