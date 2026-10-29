// Public navigation only. Completion remains a human confirmation in growth_checks.
const course='https://ghl.courtiergrowth.com/courses/products/0497ab60-1a01-4313-87e9-f58c506b8d12';
const module='/modules/8c1a3a79-98b7-4496-bcd0-07227d908be0/lessons/';
const lessonQuery='?template_id=NeoClassic&lessonRouteName=post-overview-v2';

export const oneToOnePreparation=[
 {key:'welcome',title:'Voir la vidéo de bienvenue',description:'Découvrez les étapes et les accès de votre accompagnement.',url:'https://courtiergrowth.com/welcome-expansion-1to1'},
 {key:'education',title:'Suivre le module d’onboarding',description:'La formation s’ouvre dans votre plateforme Courtier Growth.',url:course},
 {key:'intake',title:'Remplir le formulaire initial',description:'Préparez votre situation, vos attentes et votre zone ciblée.',url:course+module+'f0cdaa01-4770-43bd-b6d7-9251dfd19694'+lessonQuery},
 {key:'booking',title:'Consulter la leçon sur le premier appel',description:'David fixe manuellement l’heure et la date de l’appel. Cette leçon aide à le préparer.',url:course+module+'679655a3-d234-407b-a34e-c74e2b0a8078'+lessonQuery}
];

export const oneToOneResource=key=>oneToOnePreparation.find(item=>item.key===key);
