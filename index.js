#!/usr/bin/env node
const Nightmare = require('nightmare')
const program = require('commander')
const inquirer = require('inquirer')
const db = require('sqlite')
const fs = require('fs')

db.open('default.db').then(() => {
  return Promise.all([
    db.run("CREATE TABLE IF NOT EXISTS searches (keyword, title, author, price, city, description, creationDate)"),
    db.run("CREATE TABLE IF NOT EXISTS url (url VARCHAR, checked BOOLEAN)")
  ])
}).then(() => {
  console.log('Database opened and schemas created')
  start()
})

function start() {
  program
    .version('1.0.0')
    .option('-s, --search', 'Lance la recherche d\'annonces en ligne')
    .option('-d, --database', 'Récupère les annonces enregistrées en base de données')
    .option('-f, --file', 'Enregistre les données en base dans un fichier')

  program.parse(process.argv)

  if (program.search) {
    inquirer.prompt([
      {
        type: 'input',
        message: 'Entrez le mot clé à rechercher : ',
        name: 'keyword'
      }
    ]).then((answers) => {
      var url = 'https://www.leboncoin.fr/annonces/offres/aquitaine/?th=1&q=' + answers.keyword + '&parrot=0'
      let keyword = answers.keyword

      getAllUrls(url)
      .then((res) => {
        for (var i = 0, len = res.length; i < len; i++) {
          insertUrl(res[i])
        }
      })
      .then(() => {
        console.log('après');
        db.all("SELECT * FROM url WHERE checked = ?", false).then((res) => {
          for (var i = 0, len = res.length; i < len; i++) {
            getPageData(res[i].url, keyword)
          }
        })
      })
    })
  } else if (program.database) {
    console.log('--database');
  }  else if (program.file) {
    inquirer.prompt([
      {
        type: 'input',
        message: 'Entrez le mot clé à rechercher dans la base de données : ',
        name: 'keyword_file'
      }
    ]).then((answers) => {
      writeFile(answers)
    })
  } else {
    program.help()
  }
}

function getAllUrls (url) {
  let nightmare = Nightmare()
  return nightmare
    .goto(url)
    .evaluate(function () {
      let arr = []
      $('.tabsContent ul li a').each(function() {
        arr.push($(this).attr('href'))
      })
      return arr
    })
    .end()
    .catch(function (err)
    {
      console.error('Search failed:', err);
    })
}

function getPageData(i, keyword) {
  let nightmare = Nightmare()
    nightmare
      .goto('https:' + i)
      // .click('button.phoneNumber')
      // .wait('.phoneNumber a')
      .evaluate(function () {
        let price  = ''
        if (document.querySelector('.item_price span.value') != null) {
          price = document.querySelector('.item_price span.value').innerText
        }
        let data = {
          title: document.querySelector('h1.no-border').innerText,
          author: document.querySelector('.properties div.line_pro p a').innerText,
          price: price,
          city: document.querySelector('div.line_city h2 span.value').innerText,
          desc: document.querySelector('div.properties_description p.value').innerText,
          createdAt: document.querySelector('p.line_pro').innerText
          // phone : document.querySelector('.phoneNumber a').innerText
        }
        return data
      })
      .end()
      .then((data) => {
        insertPageData(keyword, data)
      })
      .then(() => {
        db.run("UPDATE url SET checked = ?", true);
      })
      .catch(function (err)
      {
        console.error('Search failed:', err);
      })
}

function insertPageData(keyword, data) {
  db.run("INSERT INTO searches VALUES (?, ?, ?, ?, ?, ?, ?)", keyword, data.title, data.author, data.price, data.city, data.desc, data.createdAt)
  .then(() => {
    console.log('Insert successful (page data)');
  })
}

function insertUrl(url) {
  db.all("SELECT COUNT(*) AS count FROM url WHERE url = ?", url)
  .then((res) => {
    if (res[0].count != 0) {
      console.log('Match found, no need to insert');
    } else {
      db.run("INSERT INTO url VALUES (?, ?)", url, false)
      .then(() => {
        console.log('Insert successful (url)');
      })
    }
  })
}

function writeFile(answers) {
  db.all("SELECT COUNT(keyword) AS count FROM searches WHERE keyword = ?", answers.keyword_file)
  .then((res) => {
    if (res[0].count == 0) {
      console.log('No such keyword in database. Search first');
      // start()
    } else {
      db.all("SELECT * FROM searches WHERE keyword = ?", answers.keyword_file)
      .then((res) => {
        try {
          fs.writeFile('annonces_' + answers.keyword_file + '.txt', 'Résulats de la recherche \'' + answers.keyword_file + '\'\n\n', (err) => {
            if (err) throw err
            console.log('File written')
          })
          res.forEach(function(index) {
            fs.appendFile('annonces_' + answers.keyword_file + '.txt', formatData(index), (err) => {
              if (err) throw err
              console.log('File written')
            })
          })
        } catch (err) {
          console.error('ERR > ', err)
        }
      })
    }
  })
}

function formatData(index) {
  let price = 'Non renseigné'
  if (index.price != '') {
    price = index.price
  }
  return 'Titre: ' + index.title + '\nAuteur: ' + index.author + '\nPrix: ' + price + '\nVille: ' + index.city + '\nDescription:\n' + index.description + '\n' + index.creationDate + '\n\n\n'
}
