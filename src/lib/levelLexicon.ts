import type { Language } from '../types'
import { type WordLevel } from './wordLevels'

export { WORD_LEVELS, levelHint, levelLabel, type WordLevel } from './wordLevels'

const DE_A1 = `
ich du er sie es wir ihr Sie man
sein haben werden können müssen wollen sollen dürfen
gehen kommen machen sehen geben nehmen sagen wissen
wohnen essen trinken schlafen arbeiten lernen sprechen
lesen schreiben kaufen finden bleiben
ja nein bitte danke hallo tschüss
gut schlecht groß klein neu alt viel wenig
heute morgen gestern jetzt hier dort
Haus Wohnung Stadt Land Straße Zimmer Tür Fenster
Tisch Stuhl Bett Wasser Brot Milch Kaffee Tee
Mann Frau Kind Freund Freundin Familie
Name Tag Woche Monat Jahr Zeit Uhr
Arbeit Schule Buch Auto Zug Bus
Farbe rot blau grün gelb schwarz weiß
eins zwei drei vier fünf sechs sieben acht neun zehn
hundert
`.split(/\s+/).filter(Boolean)

const DE_A2 = `
brauchen denken glauben helfen hören laufen spielen
treffen warten wünschen verstehen erklären
früh spät schnell langsam schön teuer billig
immer manchmal oft nie genug fast
Frühstück Abendessen Mittagessen Restaurant Hotel
Bahnhof Flughafen Ticket Gepäck Urlaub Reise
Geschäft Markt Bäckerei Apotheke Arzt
Wetter Sonne Regen Wind Schnee
Körper Kopf Hand Fuß Auge
Geld Preis Rechnung Karte
Problem Frage Antwort Idee
nächste letzte andere gleiche
links rechts geradeaus
`.split(/\s+/).filter(Boolean)

const DE_B1 = `
entscheiden empfehlen vergleichen vermeiden erreichen
besprechen bezweifeln überlegen vorschlagen
Erfahrung Meinung Vorteil Nachteil Grund Ziel
Möglichkeit Lösung Entwicklung Veränderung
Gesellschaft Umwelt Gesundheit Bildung
beruflich privat öffentlich persönlich
obwohl deshalb trotzdem während
wahrscheinlich unbedingt besonders
Stress Erfolg Misserfolg Verantwortung
Gewohnheit Alltag Beziehung
`.split(/\s+/).filter(Boolean)

const DE_B2 = `
auseinandersetzen durchsetzen nachweisen berücksichtigen
voraussetzen gewährleisten
Herausforderung Auswirkung Voraussetzung
Nachhaltigkeit Vielfalt Gerechtigkeit
überzeugend nachvollziehbar fragwürdig
hingegen vielmehr zumindest
Kompromiss Standpunkt Einwand
einschätzen beurteilen hinterfragen
`.split(/\s+/).filter(Boolean)

const FR_A1 = `
je tu il elle on nous vous ils elles
être avoir aller faire pouvoir vouloir devoir
venir voir dire savoir parler manger boire
habiter travailler apprendre
oui non merci bonjour salut
bon mauvais grand petit nouveau vieux
beaucoup peu aujourd hui demain hier maintenant
maison ville pays rue chambre porte fenêtre
table chaise lit eau pain lait café thé
homme femme enfant ami amie famille
nom jour semaine mois an année heure
travail école livre voiture bus
rouge bleu vert jaune noir blanc
un deux trois quatre cinq six sept huit neuf dix
cent
`.split(/\s+/).filter(Boolean)

const FR_A2 = `
besoin penser croire aider écouter courir jouer
rencontrer attendre comprendre expliquer
tôt tard vite lent beau cher
toujours parfois souvent jamais assez presque
petit-déjeuner dîner restaurant hôtel
gare aéroport billet bagage voyage
magasin marché boulangerie pharmacie médecin
temps soleil pluie vent neige
corps tête main pied œil
argent prix facture carte
problème question réponse idée
prochain dernier autre même
gauche droite tout-droit
`.split(/\s+/).filter(Boolean)

const FR_B1 = `
décider recommander comparer éviter atteindre
discuter douter proposer
expérience avis avantage inconvénient raison but
possibilité solution développement changement
société environnement santé éducation
professionnel privé public personnel
pourtant donc pendant
probablement surtout
stress succès échec responsabilité
habitude quotidien relation
`.split(/\s+/).filter(Boolean)

const FR_B2 = `
affronter justifier démontrer prendre-en-compte
défi conséquence condition
durabilité diversité justice
convaincant discutable
en-revanche du-moins
compromis point-de-vue objection
évaluer juger remettre-en-question
`.split(/\s+/).filter(Boolean)

const EN_A1 = `
i you he she it we they
be have do go come make see give take say know
can must want live eat drink sleep work learn speak
read write buy find stay
yes no please thanks hello bye
good bad big small new old much little
today tomorrow yesterday now here there
house flat city country street room door window
table chair bed water bread milk coffee tea
man woman child friend family
name day week month year time hour
work school book car bus
red blue green yellow black white
one two three four five six seven eight nine ten
hundred
`.split(/\s+/).filter(Boolean)

const EN_A2 = `
need think believe help hear run play
meet wait wish understand explain
early late fast slow nice expensive cheap
always sometimes often never enough almost
breakfast dinner restaurant hotel
station airport ticket luggage holiday trip
shop market bakery pharmacy doctor
weather sun rain wind snow
body head hand foot eye
money price bill card
problem question answer idea
next last other same
left right straight
`.split(/\s+/).filter(Boolean)

const EN_B1 = `
decide recommend compare avoid reach
discuss doubt suggest
experience opinion advantage disadvantage reason goal
possibility solution development change
society environment health education
professional private public personal
although therefore however during
probably especially
stress success failure responsibility
habit everyday relationship
`.split(/\s+/).filter(Boolean)

const EN_B2 = `
deal-with prove consider ensure
challenge impact requirement
sustainability diversity justice
convincing questionable
whereas at-least
compromise viewpoint objection
assess judge question
`.split(/\s+/).filter(Boolean)

const PACKS: Record<Language, Record<WordLevel, string[]>> = {
  de: { a1: DE_A1, a2: DE_A2, b1: DE_B1, b2: DE_B2 },
  fr: { a1: FR_A1, a2: FR_A2, b1: FR_B1, b2: FR_B2 },
  en: { a1: EN_A1, a2: EN_A2, b1: EN_B1, b2: EN_B2 },
}

export function levelWords(language: Language, level: WordLevel) {
  return PACKS[language][level]
}

export function levelWordCount(language: Language, level: WordLevel) {
  return levelWords(language, level).length
}
