const learnovaCard=document.querySelector('.learnova-card');learnovaCard.addEventListener('click',event=>{if(event.target.closest('a,button'))return;window.location.assign('learnova.html')});
