#!/usr/bin/env node
const Nightmare = require('nightmare')
const program = require('commander')
const inquirer = require('inquirer')
const db = require('sqlite')
const fs = require('fs')

db.open('default.db').then(()=>{
     return db.run("CREATE TABLE IF NOT EXISTS searches (keyword, title, author, price, city, description, creationDate)");
})

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
        getPageData(res[i], keyword)
      }
    })

  })
} else if(program.database) {
  console.log('--database');
}  else if(program.file) {
  console.log('--file');
  // inquirer.prompt([
  //   {
  //     type: 'input',
  //     message: 'Entrez le mot clé à rechercher : ',
  //     name: 'keyword'
  //   }
  // ]).then((answers) => {
  //
  // })
} else {
  program.help()
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
        let data = []
        var title = document.querySelector('h1.no-border').innerText
        var author = document.querySelector('.properties div.line_pro p a').innerText
        var price = document.querySelector('.item_price span.value').innerText
        var city = document.querySelector('div.line_city h2 span.value').innerText
        var desc = document.querySelector('div.properties_description p.value').innerText
        var createdAt = document.querySelector('p.line_pro').innerText
        // var phone = document.querySelector('.phoneNumber a').innerText
        data.push(title, author, price, city, desc, createdAt)
        return data
      })
      .end()
      .then((data) => {
        insertDatabase(keyword, data[0], data[1], data[2], data[3], data[4], data[5])
      })
      .catch(function (err)
      {
        console.error('Search failed:', err);
      })
}

function insertDatabase(keyword, title, author, price, city, desc, createdAt) {
  db.run("INSERT INTO searches VALUES (?, ?, ?, ?, ?, ?, ?)", keyword, title, author, price, city, desc, createdAt);
  console.log('db success');
}
