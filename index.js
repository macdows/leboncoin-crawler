#!/usr/bin/env node
const Nightmare = require('nightmare')
const program = require('commander')
const inquirer = require('inquirer')
const db = require('sqlite')
const fs = require('fs')

// Database
db.open('default.db').then(() => { // Ouvre ou crée la base de données
  // Crée les tables searches et url si elles n'existent pas déjà
  return Promise.all([
    db.run("CREATE TABLE IF NOT EXISTS searches (keyword, title, author, price, city, description, creationDate)"),
    db.run("CREATE TABLE IF NOT EXISTS url (url VARCHAR, checked BOOLEAN)")
  ])
}).then(() => {
  console.log('Database opened and schemas created')
  start(null) // Lance
})

function start(restart) {
  if(restart != null) {
    program.menu = true // Permet de revenir au menu si le mot clé recherché n'est pas en base (depuis la fonction d'export)
  }

  program
    .version('1.0.0')
    .option('-m, --menu', 'Crawler menu') // Menu principal
    .option('-s, --search', 'Search a keyword online') // Commande de recherche directe
    .option('-e, --export', 'Export database into file (with a keyword)') // Commande d'export direct

  program.parse(process.argv)

  if (program.menu) { // Menu principal
    inquirer.prompt([ // Demande à l'utilisateur l'action à effectuer
      {
        type: 'list',
        message: 'Select the action to perfom :',
        name: 'action',
        choices: [
          'Search a keyword online',
          'Export database into file (with a keyword)',
          'Cancel'
        ]
      }
    ]).then((answers) => {
      console.log(answers.action);
      if (answers.action == 'Search a keyword online') { // Recherche en ligne
        search()
      } else if (answers.action == 'Export database into file (with a keyword)') { // Recherche en base (export)
        save()
      } else if (answers.action == 'Cancel') { // Annuler (quitte le programme)
        process.exit(1)
      }
    })
  } else if (program.search) { // Recherche en ligne
    search()
  } else if (program.export) { // Recherche en base (export)
    save()
  } else {
    program.help() // Aide
  }
}

// Recherche un mot clé sur le site
function search () {
  // Demande à l'utilisateur le mot clé à rechercher
  inquirer.prompt([
    {
      type: 'input',
      message: 'Type a keyword to search online : ',
      name: 'keyword'
    }
  ]).then((answers) => {
    var url = 'https://www.leboncoin.fr/annonces/offres/aquitaine/?th=1&q=' + answers.keyword + '&parrot=0' // Insère le mot clé rentré par l'utilisateur dans l'url de recherche
    let keyword = answers.keyword // Stocke le mot clé

    getAllUrls(url) // Récupère les urls des annonces
    .then((res) => {
      let i = 0
      res.forEach(function(index) {
        // Enregistre en base les url récupérées
        insertUrl(index).then(() => {
          i++
          if (i == res.length) { // Permet de n'exécuter le bloc suivant qu'après toutes les insertions d'url terminées
            db.all("SELECT * FROM url WHERE checked = ?", false).then((res) => { // on récupère toutes les url qui n'ont pas encore été visitées (checked = false)
              for (var i = 0, len = res.length; i < len; i++) {
                getPageData(res[i].url, keyword) // Enregistre en base les données de la page annonce (table 'searches')
              }
            })
          }
        })
      })
    })
  })
}

// Exporte les réponses d'un mot clé depuis la base de données
function save () {
  // Demande à l'utilisateur le mot clé à exporter
  inquirer.prompt([
    {
      type: 'input',
      message: 'Type a keyword to search in the database : ',
      name: 'keyword_file'
    }
  ]).then((answers) => {
    writeFile(answers) // Appelle la fonction d'écriture du fichier
  })
}

// Récupère les url des annonces dans les href de la page des résultats de la recherche
function getAllUrls (url) {
  let nightmare = Nightmare()
  return nightmare
    .goto(url) // Connexion à la page
    .evaluate(function () { // Traitement
      let arr = []
      $('.tabsContent ul li a').each(function() {
        arr.push($(this).attr('href')) // On remplit l'array 'arr' de chaque url
      })
      return arr // Renvoie l'array avec toutes les url des annonces
    })
    .end()
    .catch(function (err)
    {
      console.error('Search failed:', err);
    })
}

// Visite chanque annonce à partir des url récupérées par la fonction getAllUrls()
function getPageData(i, keyword) {
  let nightmare = Nightmare()
    nightmare
      .goto('https:' + i) // Connexion à la page
      // ======== Tentative de clic sur le bouton qui affiche le numéro ========
      // .click('button.phoneNumber')
      // .wait('.phoneNumber a')
      // =======================================================================
      .evaluate(function () { // Traitement
        // Si le prix n'est pas indiqué, on remplace la variable par une string vide
        let price  = ''
        if (document.querySelector('.item_price span.value') != null) {
          price = document.querySelector('.item_price span.value').innerText
        }

        // Remplit l'array 'data' des informations récupérées sur la page
        let data = {
          title: document.querySelector('h1.no-border').innerText,
          author: document.querySelector('.properties div.line_pro p a').innerText,
          price: price,
          city: document.querySelector('div.line_city h2 span.value').innerText,
          desc: document.querySelector('div.properties_description p.value').innerText,
          createdAt: document.querySelector('p.line_pro').innerText
          // phone : document.querySelector('.phoneNumber a').innerText
        }
        return data // Renvoie 'data'
      })
      .end()
      .then((data) => {
        insertPageData(keyword, data) // Enregistre les données de la page (data) dans la base de données
      })
      .then(() => {
        db.run("UPDATE url SET checked = ?", true); // Passe la variable 'checked' de l'url actuelle à true afin de ne pas la visiter 2 fois
      })
      .catch(function (err)
      {
        console.error('Search failed:', err);
      })
}

// Enregistre les données d'une page d'annonce en base de données (table 'searches')
function insertPageData(keyword, data) {
  db.run("INSERT INTO searches VALUES (?, ?, ?, ?, ?, ?, ?)", keyword, data.title, data.author, data.price, data.city, data.desc, data.createdAt)
  .then(() => {
    console.log('Insert successful (page data)');
  })
}

// Enregistre les url récupérées par la fonction getAllUrls() en base de données (table 'url')
function insertUrl(url) {
  return db.all("SELECT COUNT(*) AS count FROM url WHERE url = ?", url) // Compte le nombre d'occurences de l'url dans la base de données
  .then((res) => {
    if (res[0].count != 0) { // Si il y a une occurence (ou plus, mais ça ne devrait pas arriver) on n'a pas besoin de l'enregistrer
      console.log('Match found, no need to insert');
    } else { // Sinon l'url est nouvelle et on l'enregistre
      return db.run("INSERT INTO url VALUES (?, ?)", url, false) // bool checked passé à false pour indiquer qu'on n'a pas encore visité l'url
      .then(() => {
        console.log('Insert successful (url)');
      })
    }
  })
}

// Ecriture des données à exporter dans un fichier
function writeFile(answers) {
  db.all("SELECT COUNT(keyword) AS count FROM searches WHERE keyword = ?", answers.keyword_file) // Compte le nombre d'occurences du mot clé à exporter
  .then((res) => {
    if (res[0].count == 0) { // S'il n'y a pas d'occurence, le mot clé n'est pas en base
      console.log('No such keyword in database. Search first');
      start(1) // Renvoie au menu principal
    } else { // Sinon on commence le processus d'écriture
      db.all("SELECT * FROM searches WHERE keyword = ?", answers.keyword_file) // Récupères toutes les annonces correspondant au mot clé
      .then((res) => {
        try {
          res.forEach(function(index) {
            // Crée le fichier (ou ajoute à la fin s'il est déjà créé) 'annonces_[motclé].txt'
            fs.appendFile('annonces_' + answers.keyword_file + '.txt', formatData(index), (err) => { // Voir formatData()
              if (err) throw err
              console.log('Data written')
            })
          })
        } catch (err) {
          console.error('ERR > ', err)
        }
      })
    }
  })
}

// Formate les données à écrire dans le fichier pour l'annonce passée en paramètre par souci de lisibilité
function formatData(index) {
  // Si le prix est vide, on le remplace par 'Non renseigné'
  let price = 'Non renseigné'
  if (index.price != '') {
    price = index.price
  }
  return 'Titre: ' + index.title + '\nAuteur: ' + index.author + '\nPrix: ' + price + '\nVille: ' + index.city + '\nDescription:\n' + index.description + '\n' + index.creationDate + '\n\n\n'
}
