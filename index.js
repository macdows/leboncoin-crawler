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
  start(null)
})

function start(restart) {
  if(restart != null) {
    program.menu = true
  }

  program
    .version('1.0.0')
    .option('-m, --menu', 'Crawler menu')
    .option('-s, --search', 'Search a keyword online')
    .option('-e, --export', 'Export database into file (with a keyword)')

  program.parse(process.argv)

  if (program.menu) {
    inquirer.prompt([
      {
        type: 'checkbox',
        message: 'Select the action to perfom :',
        name: 'action',
        choices: [
          'Search a keyword online',
          'Export database into file (with a keyword)',
          'Cancel'
        ]
      }
    ]).then((answers) => {
      if (answers.action[0] == 'Search a keyword online') {
        search()
      } else if (answers.action[0] == 'Export database into file (with a keyword)') {
        save()
      } else if (answers.action[0] == 'Cancel') {
        process.exit(1)
      }
    })
  } else if (program.search) {
    search()
  } else if (program.export) {
    save()
  } else {
    program.help()
  }
}

function search () {
  inquirer.prompt([
    {
      type: 'input',
      message: 'Type a keyword to search online : ',
      name: 'keyword'
    }
  ]).then((answers) => {
    var url = 'https://www.leboncoin.fr/annonces/offres/aquitaine/?th=1&q=' + answers.keyword + '&parrot=0'
    let keyword = answers.keyword

    getAllUrls(url)
    .then((res) => {
      let i = 0
      res.forEach(function(index) {
        insertUrl(index).then(() => {
          i++
          if (i == res.length) {
            db.all("SELECT * FROM url WHERE checked = ?", false).then((res) => {
              for (var i = 0, len = res.length; i < len; i++) {
                getPageData(res[i].url, keyword)
              }
            })
          }
        })
      })
    })
  })
}

function save () {
  inquirer.prompt([
    {
      type: 'input',
      message: 'Type a keyword to search in the database : ',
      name: 'keyword_file'
    }
  ]).then((answers) => {
    writeFile(answers)
  })
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
  return db.all("SELECT COUNT(*) AS count FROM url WHERE url = ?", url)
  .then((res) => {
    if (res[0].count != 0) {
      console.log('Match found, no need to insert');
    } else {
      return db.run("INSERT INTO url VALUES (?, ?)", url, false)
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
      start(1)
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
