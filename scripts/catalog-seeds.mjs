export const seeds = [
 ['pop',['Annalisa','Elodie','Mahmood','Marco Mengoni','Tiziano Ferro','Elisa']],
 ['indie',['Calcutta','Colapesce','Dimartino','Dente','Gazzelle','Levante']],
 ['rap',['Marracash','Fabri Fibra','Guè','Rkomi','Madame','Caparezza']],
 ['rock',['Vasco Rossi','Ligabue','Negramaro','Afterhours','Subsonica','Litfiba']],
 ['classics',['Lucio Dalla','Francesco De Gregori','Fabrizio De André','Lucio Battisti','Paolo Conte','Pino Daniele']],
].flatMap(([genre,names])=>names.map(name=>({name,genre})));
// Explicit identity resolved against MusicBrainz; this does not verify song language.
seeds.find(s=>s.name==='Annalisa').mbid='d60d4edc-1b8f-48be-8eeb-2ada05e45c54';
